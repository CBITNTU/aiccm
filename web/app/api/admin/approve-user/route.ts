import { NextRequest } from "next/server";
import {
  createAdminClient,
  apiResponse,
  apiError,
  getAuthenticatedUser,
  checkSuperadminRole,
} from "@/lib/api";
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

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name, approval_status")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile) {
      return apiError("User not found", 404);
    }

    if (profile.approval_status !== "pending") {
      return apiError(
        `User is already ${profile.approval_status}`,
        400
      );
    }

    // Get user's role and signup type
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    // Determine signup type based on role and company membership
    let signupType: "individual" | "new-company" | "join-company" = "individual";
    let companyName: string | undefined;

    if (userRole?.role === "sme-owner") {
      // Check if they created a company
      const { data: ownedCompany } = await supabase
        .from("companies")
        .select("company_name")
        .eq("user_id", userId)
        .single();

      if (ownedCompany) {
        signupType = "new-company";
        companyName = ownedCompany.company_name;
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

    const userName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "User";

    if (approved) {
      // Approve the user
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

    // Get pending users
    const { data: pendingUsers, error } = await supabase
      .from("profiles")
      .select(`
        user_id,
        email,
        first_name,
        last_name,
        job_title,
        approval_status,
        created_at
      `)
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching pending users:", error);
      return apiError("Failed to fetch pending users", 500);
    }

    // Enrich with role and company info
    const enrichedUsers = await Promise.all(
      (pendingUsers || []).map(async (profile) => {
        // Get role
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.user_id)
          .single();

        // Get company info if applicable
        let companyName: string | null = null;
        let signupType: string = "individual";

        if (roleData?.role === "sme-owner") {
          const { data: company } = await supabase
            .from("companies")
            .select("company_name")
            .eq("user_id", profile.user_id)
            .single();

          if (company) {
            companyName = company.company_name;
            signupType = "new-company";
          }
        } else if (roleData?.role === "sme-member") {
          const { data: joinRequest } = await supabase
            .from("company_join_requests")
            .select("company_name_requested, status")
            .eq("user_id", profile.user_id)
            .single();

          if (joinRequest) {
            companyName = joinRequest.company_name_requested;
            signupType = "join-company";
          }
        }

        return {
          ...profile,
          role: roleData?.role || "individual",
          companyName,
          signupType,
        };
      })
    );

    return apiResponse({ users: enrichedUsers });
  } catch (error) {
    console.error("Get pending users error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
