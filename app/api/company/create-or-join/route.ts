import { NextRequest } from "next/server";
import {
  createApiClient,
  createAdminClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import {
  sendEmail,
  getAdminNotificationEmailSubject,
  getAdminNotificationEmailHtml,
  getCompanyJoinRequestEmailSubject,
  getCompanyJoinRequestEmailHtml,
} from "@/lib/email";

interface NewCompanyData {
  action: "create";
  companyName: string;
  companiesHouseNumber?: string;
  websiteUrl?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
}

interface JoinCompanyData {
  action: "join";
  companyId: string;
  companyName: string;
  message?: string;
}

type RequestData = NewCompanyData | JoinCompanyData;

/**
 * POST /api/company/create-or-join
 *
 * Handles company creation and join requests for already-approved users.
 * Unlike the onboarding endpoint, this doesn't require step validation
 * and handles users who already have companies.
 *
 * Request body:
 * - For create: { action: "create", companyName, companiesHouseNumber?, websiteUrl?, address?, contactEmail?, contactPhone? }
 * - For join: { action: "join", companyId, companyName, message? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createApiClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return apiError("Unauthorized", 401);
    }

    const adminClient = createAdminClient();

    // Get current profile and verify user is approved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profileError } = await (adminClient.from("profiles") as any)
      .select("*, approval_status, account_type, first_name, last_name, job_title")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return apiError("Profile not found", 404);
    }

    // Verify user is approved
    if (profile.approval_status !== "approved") {
      return apiError("Your account must be approved before creating or joining companies", 403);
    }

    const body: RequestData = await request.json();

    if (!body.action || !["create", "join"].includes(body.action)) {
      return apiError("Invalid action. Must be 'create' or 'join'", 400);
    }

    if (body.action === "create") {
      // Create new company
      const createData = body as NewCompanyData;
      if (!createData.companyName?.trim()) {
        return apiError("Company name is required", 400);
      }

      const { data: company, error: companyError } = await adminClient
        .from("companies")
        .insert({
          company_name: createData.companyName.trim(),
          user_id: user.id,
          status: "pending_review",
          contact_email: createData.contactEmail || user.email,
          contact_phone: createData.contactPhone || null,
          contact_person: `${profile.first_name} ${profile.last_name}`,
          companies_house_number: createData.companiesHouseNumber || null,
          website_url: createData.websiteUrl || null,
          address: createData.address || null,
        })
        .select()
        .single();

      if (companyError) {
        console.error("Company creation error:", companyError);
        if (companyError.code === "23505") {
          return apiError("A company with this name already exists", 409);
        }
        return apiError("Failed to create company", 500);
      }

      // Add user as company admin (pending)
      await adminClient.from("company_members").insert({
        company_id: company.id,
        user_id: user.id,
        role: "admin",
        status: "pending",
      });

      // Handle individual user converting to business
      if (profile.account_type === "individual") {
        // Update account_type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (adminClient.from("profiles") as any)
          .update({ account_type: "business" })
          .eq("user_id", user.id);

        // Update role to sme-owner
        await adminClient.from("user_roles").upsert(
          { user_id: user.id, role: "sme-owner" },
          { onConflict: "user_id,role" }
        );

        // Remove individual role
        await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", user.id)
          .eq("role", "individual");
      } else {
        // Ensure user has sme-owner role for existing business users
        await adminClient.from("user_roles").upsert(
          { user_id: user.id, role: "sme-owner" },
          { onConflict: "user_id,role" }
        );
      }

      // Notify superadmins about new company
      const { data: superadmins } = await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "superadmin");

      if (superadmins && superadmins.length > 0) {
        const superadminUserIds = superadmins.map((s) => s.user_id);
        const { data: superadminProfiles } = await adminClient
          .from("profiles")
          .select("email")
          .in("user_id", superadminUserIds);

        const adminEmails = (superadminProfiles || [])
          .map((p) => p.email)
          .filter(Boolean) as string[];

        if (adminEmails.length > 0) {
          const userName = `${profile.first_name} ${profile.last_name}`;
          const adminNotificationData = {
            userName,
            userEmail: user.email || "",
            signupType: "new-company" as const,
            companyName: createData.companyName,
            jobTitle: profile.job_title || "",
          };

          await sendEmail({
            to: adminEmails,
            subject: getAdminNotificationEmailSubject(adminNotificationData),
            html: getAdminNotificationEmailHtml(adminNotificationData),
          });
        }
      }

      return apiResponse({
        success: true,
        companyId: company.id,
        message: `Company "${createData.companyName}" created successfully. Pending admin approval.`,
      });

    } else if (body.action === "join") {
      // Join existing company
      const joinData = body as JoinCompanyData;
      if (!joinData.companyId) {
        return apiError("Company ID is required", 400);
      }

      // Verify company exists
      const { data: company, error: companyFetchError } = await adminClient
        .from("companies")
        .select("id, company_name, user_id")
        .eq("id", joinData.companyId)
        .single();

      if (companyFetchError || !company) {
        return apiError("Company not found", 404);
      }

      // Check if user already has a pending/approved join request
      const { data: existingRequest } = await adminClient
        .from("company_join_requests")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("company_id", joinData.companyId)
        .single();

      if (existingRequest) {
        return apiError(
          `You already have a ${existingRequest.status} request to join this company`,
          409
        );
      }

      // Check if user is already a member
      const { data: existingMembership } = await adminClient
        .from("company_members")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("company_id", joinData.companyId)
        .single();

      if (existingMembership) {
        return apiError(
          `You are already a member of this company (status: ${existingMembership.status})`,
          409
        );
      }

      // Create join request
      const { error: joinRequestError } = await adminClient
        .from("company_join_requests")
        .insert({
          user_id: user.id,
          company_id: joinData.companyId,
          company_name_requested: company.company_name,
          message: joinData.message || null,
          status: "pending",
        });

      if (joinRequestError) {
        console.error("Join request error:", joinRequestError);
        return apiError("Failed to create join request", 500);
      }

      // Handle individual user converting to business
      if (profile.account_type === "individual") {
        // Update account_type
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (adminClient.from("profiles") as any)
          .update({ account_type: "business" })
          .eq("user_id", user.id);

        // Update role to sme-member
        await adminClient.from("user_roles").upsert(
          { user_id: user.id, role: "sme-member" },
          { onConflict: "user_id,role" }
        );

        // Remove individual role
        await adminClient
          .from("user_roles")
          .delete()
          .eq("user_id", user.id)
          .eq("role", "individual");
      } else {
        // Ensure user has sme-member role
        await adminClient.from("user_roles").upsert(
          { user_id: user.id, role: "sme-member" },
          { onConflict: "user_id,role" }
        );
      }

      // Notify company admins
      const { data: companyAdmins } = await adminClient
        .from("company_members")
        .select("user_id")
        .eq("company_id", joinData.companyId)
        .eq("role", "admin")
        .eq("status", "approved");

      if (companyAdmins && companyAdmins.length > 0) {
        const adminUserIds = companyAdmins.map((a) => a.user_id);
        const { data: adminProfiles } = await adminClient
          .from("profiles")
          .select("email, first_name, last_name")
          .in("user_id", adminUserIds);

        const userName = `${profile.first_name} ${profile.last_name}`;

        for (const admin of adminProfiles || []) {
          if (admin.email) {
            const emailData = {
              companyAdminName: `${admin.first_name || ""} ${admin.last_name || ""}`.trim() || "Admin",
              companyId: company.id,
              companyName: company.company_name,
              requesterName: userName,
              requesterEmail: user.email || "",
              requesterJobTitle: profile.job_title || "",
              message: joinData.message,
            };

            await sendEmail({
              to: admin.email,
              subject: getCompanyJoinRequestEmailSubject(emailData),
              html: getCompanyJoinRequestEmailHtml(emailData),
            });
          }
        }
      }

      return apiResponse({
        success: true,
        message: `Request to join "${company.company_name}" submitted. Awaiting company admin approval.`,
      });
    }

    return apiError("Invalid action", 400);
  } catch (error) {
    console.error("Company create-or-join error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
