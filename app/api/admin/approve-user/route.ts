import { NextRequest } from "next/server";
import {
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import {
  sendEmail,
  getApprovalNotificationEmailSubject,
  getApprovalNotificationEmailHtml,
} from "@/lib/email";
import { getEmailLocale } from "@/lib/email/i18n";
import {
  updateProfileByUserId,
  updateCompanyMemberStatus,
  updateCompanyStatus,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import {
  profiles,
  companies,
  userRoles,
  companyJoinRequests,
  companyMembers,
} from "@/lib/db/schema/app";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  fetchCompanySources,
  runPrefillAI,
} from "@/lib/services/companyEnrichmentService";
import { ONBOARDING_STEPS, ONBOARDING_STEP_NAMES } from "@/lib/onboarding";

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
  try {
    // Fetch and normalize company data directly (no HTTP call needed)
    const sources = await fetchCompanySources(
      params.companyName,
      params.companyNumber,
      params.websiteUrl,
    );

    if (!sources.companiesHouseHtml && !sources.endoleHtml && !sources.websiteHtml) {
      console.error("No external data fetched for prefill. Errors:", sources.errors);
      return;
    }

    const normalized = await runPrefillAI(
      params.companyName,
      params.companyNumber,
      sources,
    );

    // Apply normalized data to company if available
    if (normalized) {
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

      // Capabilities are an array of {value, confidence, evidence} objects
      if (normalized.capabilities?.length) {
        const capabilityValues = normalized.capabilities
          .map((cap) => extractValue(cap))
          .filter(Boolean);
        if (capabilityValues.length) {
          updateData.keyCapabilities = capabilityValues.join(", ");
        }
      }

      // Certifications - extract just the essential fields for display
      if (normalized.certifications?.length) {
        const cleanCerts = normalized.certifications
          .map((cert) => ({
            name: cert.name || "",
            issuer: cert.issuer || "",
            validUntil: cert.validUntil || "",
          }))
          .filter((cert) => cert.name);
        if (cleanCerts.length) {
          updateData.certifications = JSON.stringify(cleanCerts);
        }
      }

      // Equipment - extract just the essential fields for display
      if (normalized.equipment?.length) {
        const cleanEquipment = normalized.equipment
          .map((item) => ({
            name: item.name || "",
            model: item.model || "",
            capacity: item.capacity || "",
          }))
          .filter((item) => item.name);
        if (cleanEquipment.length) {
          updateData.equipment = JSON.stringify(cleanEquipment);
        }
      }

      // Store the raw extracted data for reference
      updateData.systemExtracted = JSON.stringify({
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
          updateData.financialData = JSON.stringify(financialData);
        }
      }

      // Store compliance data if available
      if (normalized.compliance) {
        updateData.complianceData = JSON.stringify(normalized.compliance);
      }

      // Update the company with prefilled data
      try {
        await db
          .update(companies)
          .set(updateData as typeof companies.$inferInsert)
          .where(eq(companies.id, companyId));
        console.log(`AI prefill applied to company ${companyId}`);
        // Prefill writes description/keyCapabilities/certifications/equipment,
        // all embedding-source fields. Both callers run this in the background,
        // so the refresh belongs here rather than at the call sites.
        await refreshCompanyEmbedding(companyId);
      } catch (updateError) {
        console.error("Error applying prefill data to company:", updateError);
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
    const { user } = await requireAuth(request);

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

    // Get user profile
    const profileRows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    const profile = profileRows[0];

    if (!profile) {
      console.error("Profile not found:", { userId });
      return apiError("User not found", 404);
    }

    // Check if user is already approved but has a pending company
    let pendingCompany: {
      id: string;
      companyName: string;
      companiesHouseNumber: string | null;
      websiteUrl: string | null;
      adminPreparedAt: Date | null;
    } | null = null;

    console.log("Approval check:", {
      userId,
      approval_status: profile.approvalStatus,
    });

    if (profile.approvalStatus === "approved") {
      // Check if they have a pending company
      const companyRows = await db
        .select({
          id: companies.id,
          companyName: companies.companyName,
          companiesHouseNumber: companies.companiesHouseNumber,
          websiteUrl: companies.websiteUrl,
          adminPreparedAt: companies.adminPreparedAt,
        })
        .from(companies)
        .where(
          and(
            eq(companies.userId, userId),
            eq(companies.status, "pending_review"),
          ),
        )
        .limit(1);

      console.log("Pending company check:", {
        companyData: companyRows[0] ?? null,
        hasPendingCompany: companyRows.length > 0,
      });

      if (companyRows[0]) {
        pendingCompany = companyRows[0];
      } else {
        return apiError(
          "User is already approved and has no pending company",
          400,
        );
      }
    } else if (profile.approvalStatus !== "pending") {
      return apiError(`User is already ${profile.approvalStatus}`, 400);
    }

    // Determine signup type from profile (reliably set during onboarding)
    let signupType: "individual" | "new-company" | "join-company" | "invited" =
      (profile.signupType as "individual" | "new-company" | "join-company" | "invited") || "individual";
    let companyName: string | undefined;
    let invitedToCompanyId: string | null = null;

    // Store company details for new-company approvals (for AI prefill)
    let companyDetails: {
      id: string;
      companyName: string;
      companiesHouseNumber: string | null;
      websiteUrl: string | null;
      adminPreparedAt: Date | null;
    } | null = null;

    console.log("Profile data for approval:", {
      userId,
      invited_to_company_id: profile.invitedToCompanyId,
      signup_type: profile.signupType,
    });

    if (profile.invitedToCompanyId) {
      invitedToCompanyId = profile.invitedToCompanyId;
      const invitedCompanyRows = await db
        .select({ id: companies.id, companyName: companies.companyName })
        .from(companies)
        .where(eq(companies.id, profile.invitedToCompanyId))
        .limit(1);

      if (invitedCompanyRows[0]) {
        signupType = "invited";
        companyName = invitedCompanyRows[0].companyName;
      }
    } else if (profile.signupType === "new-company") {
      const ownedCompanyRows = await db
        .select({
          id: companies.id,
          companyName: companies.companyName,
          companiesHouseNumber: companies.companiesHouseNumber,
          websiteUrl: companies.websiteUrl,
          adminPreparedAt: companies.adminPreparedAt,
        })
        .from(companies)
        .where(eq(companies.userId, userId))
        .limit(1);

      if (ownedCompanyRows[0]) {
        signupType = "new-company";
        companyName = ownedCompanyRows[0].companyName;
        companyDetails = ownedCompanyRows[0];
      }
    } else if (profile.signupType === "join-company") {
      const joinRequestRows = await db
        .select({ companyNameRequested: companyJoinRequests.companyNameRequested })
        .from(companyJoinRequests)
        .where(eq(companyJoinRequests.userId, userId))
        .limit(1);

      if (joinRequestRows[0]) {
        signupType = "join-company";
        companyName = joinRequestRows[0].companyNameRequested;
      }
    }

    const userName =
      `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "User";

    if (approved) {
      // If user is already approved but has a pending company, just approve the company
      if (profile.approvalStatus === "approved" && pendingCompany) {
        console.log("Approving pending company for already-approved user:", {
          userId,
          companyId: pendingCompany.id,
          companyName: pendingCompany.companyName,
        });

        // Approve the company membership
        try {
          await updateCompanyMemberStatus(
            { userId, status: "pending" },
            {
              status: "approved",
              approvedAt: new Date(),
              approvedBy: user.id,
            },
          );
        } catch (memberError) {
          console.error("Error approving company membership:", memberError);
        }

        // Update company status to active
        const updatedCompany = await updateCompanyStatus(
          { id: pendingCompany.id, status: "pending_review" },
          { status: "active" },
        );

        if (!updatedCompany) {
          console.error("Error updating company status: no rows updated");
          return apiError("Failed to approve company", 500);
        }

        // Trigger AI prefill in the background — unless a superadmin already
        // curated this company from /admin/approvals. Prefill overwrites
        // description, address, capabilities, certifications and equipment, so
        // running it here would discard that work.
        if (pendingCompany.adminPreparedAt) {
          console.log(
            `Skipping AI prefill for admin-prepared company ${pendingCompany.id}`,
          );
        } else {
          triggerAIPrefill(pendingCompany.id, {
            companyName: pendingCompany.companyName,
            companyNumber: pendingCompany.companiesHouseNumber,
            websiteUrl: pendingCompany.websiteUrl,
          }).catch((err) => {
            console.error("Background AI prefill error:", err);
          });
        }

        // Log admin approval
        await logApiEvent(request, {
          actionType: "admin_company_approved",
          userId: user.id,
          userEmail: user.email || undefined,
          entityType: "company",
          entityId: pendingCompany.id,
          details: {
            approvedCompanyId: pendingCompany.id,
            approvedCompanyName: pendingCompany.companyName,
            ownerUserId: userId,
            ownerUserName: userName,
          },
        });

        return apiResponse<ApproveUserResponse>({
          success: true,
          message: `Company "${pendingCompany.companyName}" has been approved`,
        });
      }

      // Approve the user (only if they're pending)
      const updatedProfile = await updateProfileByUserId(userId, {
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: user.id,
      });

      if (!updatedProfile) {
        console.error("Error approving user: no rows updated");
        return apiError("Failed to approve user", 500);
      }

      // If user created a new company, also approve the company membership
      if (signupType === "new-company") {
        await updateCompanyMemberStatus(
          { userId, status: "pending" },
          {
            status: "approved",
            approvedAt: new Date(),
            approvedBy: user.id,
          },
        );

        // Update company status to active
        await updateCompanyStatus(
          { userId, status: "pending_review" },
          { status: "active" },
        );

        // Trigger AI prefill in the background (non-blocking) — skipped when a
        // superadmin already prepared the company, since prefill overwrites the
        // curated description, address, capabilities and equipment.
        if (companyDetails?.adminPreparedAt) {
          console.log(
            `Skipping AI prefill for admin-prepared company ${companyDetails.id}`,
          );
        } else if (companyDetails) {
          triggerAIPrefill(companyDetails.id, {
            companyName: companyDetails.companyName,
            companyNumber: companyDetails.companiesHouseNumber,
            websiteUrl: companyDetails.websiteUrl,
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

        const memberUpdate = await updateCompanyMemberStatus(
          { userId, companyId: invitedToCompanyId, status: "pending" },
          {
            status: "approved",
            approvedAt: new Date(),
            approvedBy: user.id,
          },
        );

        console.log("Company member update result:", {
          memberUpdate,
        });

        // Clear the invited_to_company_id since they're now approved
        await updateProfileByUserId(userId, {
          invitedToCompanyId: null,
        });
      } else {
        console.log("Not an invited user or no invitedToCompanyId:", {
          signupType,
          invitedToCompanyId,
        });
      }

      // Send approval email
      if (profile.email) {
        const emailData = {
          locale: await getEmailLocale(),
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
      const rejectedProfile = await updateProfileByUserId(userId, {
        approvalStatus: "rejected",
        rejectionReason: rejectionReason || null,
      });

      if (!rejectedProfile) {
        console.error("Error rejecting user: no rows updated");
        return apiError("Failed to reject user", 500);
      }

      // Send rejection email
      if (profile.email) {
        const emailData = {
          locale: await getEmailLocale(),
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
    return handleApiError(error);
  }
}

// GET endpoint to list pending users
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Check superadmin role
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    // Get pending users
    const pendingUsers = await db
      .select()
      .from(profiles)
      .where(eq(profiles.approvalStatus, "pending"))
      .orderBy(desc(profiles.createdAt));

    // Also get approved users who have pending companies
    const pendingCompanies = await db
      .select({
        userId: companies.userId,
        id: companies.id,
        companyName: companies.companyName,
        companiesHouseNumber: companies.companiesHouseNumber,
        websiteUrl: companies.websiteUrl,
        contactPerson: companies.contactPerson,
        contactEmail: companies.contactEmail,
        contactPhone: companies.contactPhone,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .where(eq(companies.status, "pending_review"))
      .orderBy(desc(companies.createdAt));

    // Get profiles for users with pending companies
    const pendingCompanyUserIds = pendingCompanies
      .map((c) => c.userId)
      .filter((id): id is string => id !== null);

    let approvedUsersWithPendingCompanies: typeof pendingUsers = [];

    if (pendingCompanyUserIds.length > 0) {
      approvedUsersWithPendingCompanies = await db
        .select()
        .from(profiles)
        .where(
          and(
            inArray(profiles.userId, pendingCompanyUserIds),
            eq(profiles.approvalStatus, "approved"),
          ),
        );
    }

    // Combine pending users and approved users with pending companies
    const allUsersToProcess = [
      ...pendingUsers,
      ...approvedUsersWithPendingCompanies,
    ];

    // Create a map of company data by userId for quick lookup
    const companyMap = new Map(
      pendingCompanies.map((c) => [c.userId, c]),
    );

    // Enrich with role and company info
    const enrichedUsers = await Promise.all(
      allUsersToProcess.map(async (profile) => {
        // Get role
        const roleRows = await db
          .select({ role: userRoles.role })
          .from(userRoles)
          .where(eq(userRoles.userId, profile.userId))
          .limit(1);
        const roleData = roleRows[0] ?? null;

        // Get company info if applicable
        let companyName: string | null = null;
        let signupType: string = "individual";

        let company: {
          id: string;
          companyName: string;
          companiesHouseNumber: string | null;
          websiteUrl: string | null;
          contactPerson: string | null;
          contactEmail: string | null;
          contactPhone: string | null;
        } | null = null;

        // Check if user has a pending company (from the map or by query)
        const pendingCompany = companyMap.get(profile.userId);

        if (pendingCompany) {
          company = {
            id: pendingCompany.id,
            companyName: pendingCompany.companyName,
            companiesHouseNumber: pendingCompany.companiesHouseNumber,
            websiteUrl: pendingCompany.websiteUrl,
            contactPerson: pendingCompany.contactPerson,
            contactEmail: pendingCompany.contactEmail,
            contactPhone: pendingCompany.contactPhone,
          };
          companyName = pendingCompany.companyName;
          signupType = "new-company";
        } else if (profile.signupType === "new-company") {
          const companyRows = await db
            .select({
              id: companies.id,
              companyName: companies.companyName,
              companiesHouseNumber: companies.companiesHouseNumber,
              websiteUrl: companies.websiteUrl,
              contactPerson: companies.contactPerson,
              contactEmail: companies.contactEmail,
              contactPhone: companies.contactPhone,
            })
            .from(companies)
            .where(eq(companies.userId, profile.userId))
            .limit(1);

          if (companyRows[0]) {
            company = companyRows[0];
            companyName = companyRows[0].companyName;
            signupType = "new-company";
          }
        } else if (profile.signupType === "join-company") {
          // Check for join request first
          const joinRequestRows = await db
            .select({
              companyNameRequested: companyJoinRequests.companyNameRequested,
              status: companyJoinRequests.status,
            })
            .from(companyJoinRequests)
            .where(eq(companyJoinRequests.userId, profile.userId))
            .limit(1);

          if (joinRequestRows[0]) {
            companyName = joinRequestRows[0].companyNameRequested;
            signupType = "join-company";
          } else {
            // Check for invited user (has company_members entry)
            const memberRows = await db
              .select({
                companyId: companyMembers.companyId,
              })
              .from(companyMembers)
              .where(
                and(
                  eq(companyMembers.userId, profile.userId),
                  eq(companyMembers.status, "pending"),
                ),
              )
              .limit(1);

            if (memberRows[0]) {
              // Get company name
              const companyRows = await db
                .select({ companyName: companies.companyName })
                .from(companies)
                .where(eq(companies.id, memberRows[0].companyId))
                .limit(1);

              if (companyRows[0]) {
                companyName = companyRows[0].companyName;
                signupType = "invited";
              }
            }
          }
        }

        return {
          ...profile,
          role: roleData?.role || "individual",
          companyName,
          signupType,
          company,
          onboarding: {
            currentStep:
              profile.onboardingStep || ONBOARDING_STEPS.EMAIL_VERIFICATION,
            currentStepName:
              ONBOARDING_STEP_NAMES[
                (profile.onboardingStep ||
                  ONBOARDING_STEPS.EMAIL_VERIFICATION) as keyof typeof ONBOARDING_STEP_NAMES
              ] || "Unknown",
            completedAt: profile.onboardingCompletedAt,
            isComplete: !!profile.onboardingCompletedAt,
          },
        };
      }),
    );

    return apiResponse({ users: enrichedUsers });
  } catch (error) {
    return handleApiError(error);
  }
}
