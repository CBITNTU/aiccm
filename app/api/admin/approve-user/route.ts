import { NextRequest } from "next/server";
import {
  createAdminClient,
  apiResponse,
  apiError,
  getAuthenticatedUser,
  checkSuperadminRole,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  sendEmail,
  getApprovalNotificationEmailSubject,
  getApprovalNotificationEmailHtml,
} from "@/lib/email";

export interface ApproveUserRequest {
  userId: string;
  approved: boolean;
  rejectionReason?: string;
}

/**
 * Triggers AI prefill for a company in the background.
 * Fetches data from Companies House, Endole, and company website,
 * then applies the normalized data to the company record.
 */
async function triggerAIPrefill(
  companyId: string,
  params: {
    companyName: string;
    companyNumber: string | null;
    websiteUrl: string | null;
  },
) {
  const supabase = createAdminClient();

  try {
    // Fetch prefill data from external sources
    const prefillResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/prefill-company-data`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: params.companyName,
          companyNumber: params.companyNumber,
          websiteUrl: params.websiteUrl,
        }),
      },
    );

    if (!prefillResponse.ok) {
      console.error("Prefill API returned error:", prefillResponse.status);
      return;
    }

    const prefillData = await prefillResponse.json();

    // Apply normalized data to company if available
    if (prefillData.normalized) {
      const normalized = prefillData.normalized;
      const updateData: Record<string, unknown> = {};

      // Helper to extract value from structured field {value, confidence, evidence}
      const extractValue = (field: unknown): string | null => {
        if (!field) return null;
        if (typeof field === "string") return field;
        if (
          typeof field === "object" &&
          "value" in (field as Record<string, unknown>)
        ) {
          return (field as { value: string }).value || null;
        }
        return null;
      };

      // Map normalized fields to company columns - extract .value from structured fields
      const description = extractValue(normalized.description);
      if (description) updateData.description = description;

      const address = extractValue(normalized.address);
      if (address) updateData.address = address;

      const postcode = extractValue(normalized.postcode);
      if (postcode) updateData.postcode = postcode;

      // Capabilities are an array of {value, confidence, evidence} objects
      if (normalized.capabilities?.length) {
        const capabilityValues = normalized.capabilities
          .map((cap: unknown) => extractValue(cap))
          .filter(Boolean);
        if (capabilityValues.length) {
          updateData.key_capabilities = capabilityValues.join(", ");
        }
      }

      // Certifications - extract just the essential fields for display
      if (normalized.certifications?.length) {
        const cleanCerts = normalized.certifications
          .map((cert: Record<string, unknown>) => ({
            name: cert.name || "",
            issuer: cert.issuer || "",
            validUntil: cert.validUntil || "",
          }))
          .filter((cert: { name: string }) => cert.name);
        if (cleanCerts.length) {
          updateData.certifications = JSON.stringify(cleanCerts);
        }
      }

      // Equipment - extract just the essential fields for display
      if (normalized.equipment?.length) {
        const cleanEquipment = normalized.equipment
          .map((eq: Record<string, unknown>) => ({
            name: eq.name || "",
            model: eq.model || "",
            capacity: eq.capacity || "",
          }))
          .filter((eq: { name: string }) => eq.name);
        if (cleanEquipment.length) {
          updateData.equipment = JSON.stringify(cleanEquipment);
        }
      }

      // Store the raw extracted data for reference
      updateData.system_extracted = JSON.stringify({
        prefillData: normalized,
        fetchedAt: new Date().toISOString(),
      });

      // Store financial data - extract values from structured fields
      if (normalized.financial) {
        const financial = normalized.financial;
        const financialData: Record<
          string,
          { value: number; confidence: number }
        > = {};

        for (const [key, field] of Object.entries(financial)) {
          if (
            field &&
            typeof field === "object" &&
            "value" in (field as Record<string, unknown>)
          ) {
            const typedField = field as { value: number; confidence: number };
            if (typedField.value && typedField.value > 0) {
              financialData[key] = {
                value: typedField.value,
                confidence: Math.round((typedField.confidence || 0) * 100),
              };
            }
          }
        }

        if (Object.keys(financialData).length) {
          updateData.financial_data = JSON.stringify(financialData);
        }
      }

      // Store compliance data if available
      if (normalized.compliance) {
        updateData.compliance_data = JSON.stringify(normalized.compliance);
      }

      // Update the company with prefilled data
      const { error: updateError } = await supabase
        .from("companies")
        .update(updateData)
        .eq("id", companyId);

      if (updateError) {
        console.error("Error applying prefill data to company:", updateError);
      } else {
        console.log(`AI prefill applied to company ${companyId}`);
      }
    }
  } catch (error) {
    console.error("Error in triggerAIPrefill:", error);
  }
}

export interface ApproveUserResponse {
  success: boolean;
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    // Check superadmin role
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const body: ApproveUserRequest = await request.json();
    const { userId, approved, rejectionReason } = body;

    if (!userId) {
      return apiError("User ID is required", 400);
    }

    const supabase = createAdminClient();

    // Get user profile - use * to avoid issues with missing columns during migration
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      console.error("Profile not found:", { userId, profileError });
      return apiError("User not found", 404);
    }

    // Check if user is already approved but has a pending company
    // This handles the case where approved users create new companies
    let pendingCompany: {
      id: string;
      company_name: string;
      companies_house_number: string | null;
      website_url: string | null;
    } | null = null;

    console.log("Approval check:", {
      userId,
      approval_status: profile.approval_status,
    });

    if (profile.approval_status === "approved") {
      // Check if they have a pending company
      const { data: companyData, error: companyError } = await supabase
        .from("companies")
        .select("id, company_name, companies_house_number, website_url")
        .eq("user_id", userId)
        .eq("status", "pending_review")
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid error if no company

      console.log("Pending company check:", {
        companyData,
        companyError,
        hasPendingCompany: !!companyData,
      });

      if (companyData) {
        pendingCompany = companyData;
        // User is approved but has pending company - we'll handle this in the approval flow
      } else {
        // User is approved and has no pending company - can't approve again
        return apiError(
          "User is already approved and has no pending company",
          400,
        );
      }
    } else if (profile.approval_status !== "pending") {
      return apiError(`User is already ${profile.approval_status}`, 400);
    }

    // Get user's role and signup type
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    // Determine signup type based on role and company membership
    let signupType: "individual" | "new-company" | "join-company" | "invited" =
      "individual";
    let companyName: string | undefined;
    let invitedToCompanyId: string | null = null;

    // Store company details for new-company approvals (for AI prefill)
    let companyDetails: {
      id: string;
      company_name: string;
      companies_house_number: string | null;
      website_url: string | null;
    } | null = null;

    // Check if user was invited (has invited_to_company_id set OR signup_type is "invited")
    // We check invited_to_company_id as primary indicator since signup_type column may not exist yet
    console.log("Profile data for approval:", {
      userId,
      invited_to_company_id: profile.invited_to_company_id,
      signup_type: profile.signup_type,
      role: userRole?.role,
    });

    if (profile.invited_to_company_id) {
      invitedToCompanyId = profile.invited_to_company_id;
      const { data: invitedCompany } = await supabase
        .from("companies")
        .select("id, company_name")
        .eq("id", profile.invited_to_company_id)
        .single();

      if (invitedCompany) {
        signupType = "invited";
        companyName = invitedCompany.company_name;
      }
    } else if (userRole?.role === "sme-owner") {
      // Check if they created a company
      const { data: ownedCompany } = await supabase
        .from("companies")
        .select("id, company_name, companies_house_number, website_url")
        .eq("user_id", userId)
        .single();

      if (ownedCompany) {
        signupType = "new-company";
        companyName = ownedCompany.company_name;
        companyDetails = ownedCompany;
      }
    } else if (userRole?.role === "sme-member") {
      // Check if they have a join request
      const { data: joinRequest } = await supabase
        .from("company_join_requests")
        .select("company_name_requested")
        .eq("user_id", userId)
        .single();

      if (joinRequest) {
        signupType = "join-company";
        companyName = joinRequest.company_name_requested;
      }
    }

    const userName =
      `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "User";

    if (approved) {
      // If user is already approved but has a pending company, just approve the company
      if (profile.approval_status === "approved" && pendingCompany) {
        console.log("Approving pending company for already-approved user:", {
          userId,
          companyId: pendingCompany.id,
          companyName: pendingCompany.company_name,
        });

        // Approve the company membership
        const { error: memberError } = await supabase
          .from("company_members")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            approved_by: user.id,
          })
          .eq("user_id", userId)
          .eq("status", "pending");

        if (memberError) {
          console.error("Error approving company membership:", memberError);
        }

        // Update company status to active
        const { error: companyError } = await supabase
          .from("companies")
          .update({ status: "active" })
          .eq("id", pendingCompany.id)
          .eq("status", "pending_review");

        if (companyError) {
          console.error("Error updating company status:", companyError);
          return apiError("Failed to approve company", 500);
        }

        // Trigger AI prefill in the background
        triggerAIPrefill(pendingCompany.id, {
          companyName: pendingCompany.company_name,
          companyNumber: pendingCompany.companies_house_number,
          websiteUrl: pendingCompany.website_url,
        }).catch((err) => {
          console.error("Background AI prefill error:", err);
        });

        // Log admin approval
        await logApiEvent(request, {
          actionType: "admin_company_approved",
          userId: user.id,
          userEmail: user.email || undefined,
          entityType: "company",
          entityId: pendingCompany.id,
          details: {
            approvedCompanyId: pendingCompany.id,
            approvedCompanyName: pendingCompany.company_name,
            ownerUserId: userId,
            ownerUserName: userName,
          },
        });

        return apiResponse<ApproveUserResponse>({
          success: true,
          message: `Company "${pendingCompany.company_name}" has been approved`,
        });
      }

      // Approve the user (only if they're pending)
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          approval_status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error approving user:", updateError);
        return apiError("Failed to approve user", 500);
      }

      // If user created a new company, also approve the company membership
      if (signupType === "new-company") {
        await supabase
          .from("company_members")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            approved_by: user.id,
          })
          .eq("user_id", userId)
          .eq("status", "pending");

        // Update company status to active
        await supabase
          .from("companies")
          .update({ status: "active" })
          .eq("user_id", userId)
          .eq("status", "pending_review");

        // Trigger AI prefill in the background (non-blocking)
        // This will fetch data from Companies House, Endole, and company website
        if (companyDetails) {
          triggerAIPrefill(companyDetails.id, {
            companyName: companyDetails.company_name,
            companyNumber: companyDetails.companies_house_number,
            websiteUrl: companyDetails.website_url,
          }).catch((err) => {
            console.error("Background AI prefill error:", err);
          });
        }
      }

      // If user was invited, approve their company membership
      if (signupType === "invited" && invitedToCompanyId) {
        console.log("Approving invited user company membership:", {
          userId,
          invitedToCompanyId,
        });

        const { data: memberUpdate, error: memberError } = await supabase
          .from("company_members")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            approved_by: user.id,
          })
          .eq("user_id", userId)
          .eq("company_id", invitedToCompanyId)
          .eq("status", "pending")
          .select();

        console.log("Company member update result:", {
          memberUpdate,
          memberError,
        });

        // Clear the invited_to_company_id since they're now approved
        await supabase
          .from("profiles")
          .update({ invited_to_company_id: null })
          .eq("user_id", userId);
      } else {
        console.log("Not an invited user or no invitedToCompanyId:", {
          signupType,
          invitedToCompanyId,
        });
      }

      // Send approval email
      if (profile.email) {
        const emailData = {
          userName,
          approved: true,
          signupType,
          companyName,
        };

        await sendEmail({
          to: profile.email,
          subject: getApprovalNotificationEmailSubject(emailData),
          html: getApprovalNotificationEmailHtml(emailData),
        });
      }

      // Log admin approval
      await logApiEvent(request, {
        actionType: "admin_user_approved",
        userId: user.id,
        userEmail: user.email || undefined,
        entityType: "user",
        entityId: userId,
        details: {
          approvedUserId: userId,
          approvedUserName: userName,
          signupType,
          companyName,
        },
      });

      return apiResponse<ApproveUserResponse>({
        success: true,
        message: `User ${userName} has been approved`,
      });
    } else {
      // Reject the user
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          approval_status: "rejected",
          rejection_reason: rejectionReason || null,
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error rejecting user:", updateError);
        return apiError("Failed to reject user", 500);
      }

      // Send rejection email
      if (profile.email) {
        const emailData = {
          userName,
          approved: false,
          rejectionReason,
          signupType,
          companyName,
        };

        await sendEmail({
          to: profile.email,
          subject: getApprovalNotificationEmailSubject(emailData),
          html: getApprovalNotificationEmailHtml(emailData),
        });
      }

      // Log admin rejection
      await logApiEvent(request, {
        actionType: "admin_user_rejected",
        userId: user.id,
        userEmail: user.email || undefined,
        entityType: "user",
        entityId: userId,
        details: {
          rejectedUserId: userId,
          rejectedUserName: userName,
          rejectionReason: rejectionReason || "No reason provided",
          signupType,
          companyName,
        },
      });

      return apiResponse<ApproveUserResponse>({
        success: true,
        message: `User ${userName} has been rejected`,
      });
    }
  } catch (error) {
    console.error("Approve user error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}

// GET endpoint to list pending users
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    // Check superadmin role
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const supabase = createAdminClient();

    // Get pending users - use * to avoid issues with missing columns during migration
    const { data: pendingUsers, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false });

    // Also get approved users who have pending companies (companies with status "pending_review")
    // These are users who created companies after being approved
    const { data: pendingCompanies } = await supabase
      .from("companies")
      .select(
        "user_id, id, company_name, companies_house_number, website_url, contact_person, contact_email, contact_phone, created_at",
      )
      .eq("status", "pending_review")
      .order("created_at", { ascending: false });

    // Get profiles for users with pending companies
    const pendingCompanyUserIds = (pendingCompanies || []).map(
      (c) => c.user_id,
    );
    let approvedUsersWithPendingCompanies: typeof pendingUsers = [];

    if (pendingCompanyUserIds.length > 0) {
      // Filter out null values to satisfy type requirement for `.in()`
      const nonNullPendingCompanyUserIds = pendingCompanyUserIds.filter(
        (id): id is string => id !== null,
      );

      if (nonNullPendingCompanyUserIds.length > 0) {
        const { data: approvedUsers } = await supabase
          .from("profiles")
          .select("*")
          .in("user_id", nonNullPendingCompanyUserIds)
          .eq("approval_status", "approved");
        approvedUsersWithPendingCompanies = approvedUsers || [];
      }
    }
    if (error) {
      console.error("Error fetching pending users:", error);
      return apiError("Failed to fetch pending users", 500);
    }

    // Combine pending users and approved users with pending companies
    const allUsersToProcess = [
      ...(pendingUsers || []),
      ...approvedUsersWithPendingCompanies,
    ];

    // Create a map of company data by user_id for quick lookup
    const companyMap = new Map(
      (pendingCompanies || []).map((c) => [c.user_id, c]),
    );

    // Enrich with role and company info
    const enrichedUsers = await Promise.all(
      allUsersToProcess.map(async (profile) => {
        // Get role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.user_id)
          .single();

        // Get company info if applicable
        let companyName: string | null = null;
        let signupType: string = "individual";

        // Company details object for new-company signups
        let company: {
          id: string;
          company_name: string;
          companies_house_number: string | null;
          website_url: string | null;
          contact_person: string | null;
          contact_email: string | null;
          contact_phone: string | null;
        } | null = null;

        // Check if user has a pending company (from the map or by query)
        const pendingCompany = companyMap.get(profile.user_id);

        if (pendingCompany) {
          // User has a pending company - this is a new-company signup
          company = {
            id: pendingCompany.id,
            company_name: pendingCompany.company_name,
            companies_house_number: pendingCompany.companies_house_number,
            website_url: pendingCompany.website_url,
            contact_person: pendingCompany.contact_person,
            contact_email: pendingCompany.contact_email,
            contact_phone: pendingCompany.contact_phone,
          };
          companyName = pendingCompany.company_name;
          signupType = "new-company";
        } else if (roleData?.role === "sme-owner") {
          // Fallback: query for company if not in pending companies map
          const { data: companyData } = await supabase
            .from("companies")
            .select(
              "id, company_name, companies_house_number, website_url, contact_person, contact_email, contact_phone",
            )
            .eq("user_id", profile.user_id)
            .single();

          if (companyData) {
            company = companyData;
            companyName = companyData.company_name;
            signupType = "new-company";
          }
        } else if (roleData?.role === "sme-member") {
          // Check for join request first
          const { data: joinRequest } = await supabase
            .from("company_join_requests")
            .select("company_name_requested, status")
            .eq("user_id", profile.user_id)
            .single();

          if (joinRequest) {
            companyName = joinRequest.company_name_requested;
            signupType = "join-company";
          } else {
            // Check for invited user (has company_members entry)
            const { data: memberEntry } = await supabase
              .from("company_members")
              .select("company_id, companies:company_id(company_name)")
              .eq("user_id", profile.user_id)
              .eq("status", "pending")
              .single();

            if (memberEntry && memberEntry.companies) {
              const companyData = memberEntry.companies as {
                company_name: string;
              };
              companyName = companyData.company_name;
              signupType = "invited";
            }
          }
        }

        return {
          ...profile,
          role: roleData?.role || "individual",
          companyName,
          signupType,
          company, // Full company details for new-company signups
        };
      }),
    );

    return apiResponse({ users: enrichedUsers });
  } catch (error) {
    console.error("Get pending users error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
