import { NextRequest } from "next/server";
import {
  createAdminClient,
  createApiClient,
  apiResponse,
  apiError,
  getAuthenticatedUser,
} from "@/lib/api";
import {
  sendEmail,
  getCompanyAdminApprovalEmailSubject,
  getCompanyAdminApprovalEmailHtml,
  getAdminNotificationEmailSubject,
  getAdminNotificationEmailHtml,
} from "@/lib/email";

export interface ApproveMemberRequest {
  requestId: string;
  approved: boolean;
  rejectionReason?: string;
}

export interface ApproveMemberResponse {
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

    const body: ApproveMemberRequest = await request.json();
    const { requestId, approved, rejectionReason } = body;

    if (!requestId) {
      return apiError("Request ID is required", 400);
    }

    const supabase = createAdminClient();

    // Get join request
    const { data: joinRequest, error: requestError } = await supabase
      .from("company_join_requests")
      .select(`
        id,
        user_id,
        company_id,
        company_name_requested,
        status
      `)
      .eq("id", requestId)
      .single();

    if (requestError || !joinRequest) {
      return apiError("Join request not found", 404);
    }

    // Check if user is admin of this company
    const { data: membership } = await supabase
      .from("company_members")
      .select("role, status")
      .eq("company_id", joinRequest.company_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || membership.role !== "admin" || membership.status !== "approved") {
      return apiError("You are not authorized to approve members for this company", 403);
    }

    // Check if request is in a valid state
    if (joinRequest.status !== "pending") {
      return apiError(`This request is already ${joinRequest.status}`, 400);
    }

    // Get requester profile
    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("user_id", joinRequest.user_id)
      .single();

    // Get current user's profile for admin name
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", user.id)
      .single();

    const requesterName = `${requesterProfile?.first_name || ""} ${requesterProfile?.last_name || ""}`.trim() || "User";
    const adminName = `${adminProfile?.first_name || ""} ${adminProfile?.last_name || ""}`.trim() || "Company Admin";

    if (approved) {
      // Company admin approves - update status to approved_by_admin
      const { error: updateError } = await supabase
        .from("company_join_requests")
        .update({
          status: "approved_by_admin",
          admin_approved_at: new Date().toISOString(),
          admin_approved_by: user.id,
        })
        .eq("id", requestId);

      if (updateError) {
        console.error("Error approving member:", updateError);
        return apiError("Failed to approve member", 500);
      }

      // Send email to requester about partial approval
      if (requesterProfile?.email) {
        const emailData = {
          userName: requesterName,
          companyName: joinRequest.company_name_requested,
          approvedByCompanyAdmin: true,
          companyAdminName: adminName,
        };

        await sendEmail({
          to: requesterProfile.email,
          subject: getCompanyAdminApprovalEmailSubject(emailData),
          html: getCompanyAdminApprovalEmailHtml(emailData),
        });
      }

      // Notify superadmins that this request is ready for final approval
      const { data: superadmins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "superadmin");

      if (superadmins && superadmins.length > 0) {
        const superadminUserIds = superadmins.map((s) => s.user_id);
        const { data: superadminProfiles } = await supabase
          .from("profiles")
          .select("email")
          .in("user_id", superadminUserIds);

        const adminEmails = (superadminProfiles || [])
          .map((p) => p.email)
          .filter(Boolean) as string[];

        if (adminEmails.length > 0) {
          const adminNotificationData = {
            userName: requesterName,
            userEmail: requesterProfile?.email || "",
            signupType: "join-company" as const,
            companyName: joinRequest.company_name_requested,
          };

          await sendEmail({
            to: adminEmails,
            subject: `[Ready for Approval] Join request approved by ${joinRequest.company_name_requested}`,
            html: getAdminNotificationEmailHtml(adminNotificationData),
          });
        }
      }

      return apiResponse<ApproveMemberResponse>({
        success: true,
        message: `${requesterName}'s request has been approved. Awaiting platform admin approval.`,
      });
    } else {
      // Company admin rejects
      const { error: updateError } = await supabase
        .from("company_join_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason || "Rejected by company administrator",
          rejected_by: user.id,
        })
        .eq("id", requestId);

      if (updateError) {
        console.error("Error rejecting member:", updateError);
        return apiError("Failed to reject member", 500);
      }

      // Send rejection email to requester
      if (requesterProfile?.email) {
        const emailData = {
          userName: requesterName,
          companyName: joinRequest.company_name_requested,
          approvedByCompanyAdmin: false,
          companyAdminName: adminName,
        };

        await sendEmail({
          to: requesterProfile.email,
          subject: getCompanyAdminApprovalEmailSubject(emailData),
          html: getCompanyAdminApprovalEmailHtml(emailData),
        });
      }

      return apiResponse<ApproveMemberResponse>({
        success: true,
        message: `${requesterName}'s request has been rejected`,
      });
    }
  } catch (error) {
    console.error("Approve member error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}

// GET endpoint to list pending join requests for a company
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(authError || "Unauthorized", 401);
    }

    const supabase = createAdminClient();

    // Get companies where user is an approved member (any role)
    const { data: userMemberships } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", user.id)
      .eq("status", "approved");

    if (!userMemberships || userMemberships.length === 0) {
      return apiResponse({ requests: [], members: [] });
    }

    const companyIds = userMemberships.map((m) => m.company_id);
    const adminCompanyIds = userMemberships
      .filter((m) => m.role === "admin")
      .map((m) => m.company_id);

    // Get pending join requests only for companies where user is admin
    let joinRequests: Array<{
      id: string;
      user_id: string;
      company_id: string;
      company_name_requested: string;
      message: string | null;
      status: string;
      created_at: string;
    }> = [];

    if (adminCompanyIds.length > 0) {
      const { data: requestsData, error: requestsError } = await supabase
        .from("company_join_requests")
        .select(`
          id,
          user_id,
          company_id,
          company_name_requested,
          message,
          status,
          created_at
        `)
        .in("company_id", adminCompanyIds)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (requestsError) {
        console.error("Error fetching join requests:", requestsError);
        return apiError("Failed to fetch join requests", 500);
      }

      joinRequests = requestsData || [];
    }

    // Get current members for all companies the user belongs to
    const { data: members, error: membersError } = await supabase
      .from("company_members")
      .select(`
        id,
        company_id,
        user_id,
        role,
        status,
        created_at
      `)
      .in("company_id", companyIds)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (membersError) {
      console.error("Error fetching members:", membersError);
      return apiError("Failed to fetch members", 500);
    }

    // Get users who have been approved by company admin but are awaiting platform admin approval
    // These are in company_join_requests with status "approved_by_admin"
    const { data: pendingPlatformApproval, error: pendingError } = await supabase
      .from("company_join_requests")
      .select(`
        id,
        user_id,
        company_id,
        company_name_requested,
        status,
        created_at
      `)
      .in("company_id", companyIds)
      .eq("status", "approved_by_admin")
      .order("created_at", { ascending: false });

    if (pendingError) {
      console.error("Error fetching pending platform approvals:", pendingError);
      // Non-fatal, continue with empty array
    }

    // Enrich with user profile info
    const enrichedRequests = await Promise.all(
      (joinRequests || []).map(async (req) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, first_name, last_name, job_title")
          .eq("user_id", req.user_id)
          .single();

        return {
          ...req,
          user: profile
            ? {
                email: profile.email,
                firstName: profile.first_name,
                lastName: profile.last_name,
                jobTitle: profile.job_title,
              }
            : null,
        };
      })
    );

    const enrichedMembers = await Promise.all(
      (members || []).map(async (member) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, first_name, last_name, job_title")
          .eq("user_id", member.user_id)
          .single();

        return {
          ...member,
          user: profile
            ? {
                email: profile.email,
                firstName: profile.first_name,
                lastName: profile.last_name,
                jobTitle: profile.job_title,
              }
            : null,
        };
      })
    );

    // Enrich pending platform approval users and add them to members with special status
    const enrichedPendingApprovals = await Promise.all(
      (pendingPlatformApproval || []).map(async (req) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, first_name, last_name, job_title")
          .eq("user_id", req.user_id)
          .single();

        return {
          id: req.id,
          company_id: req.company_id,
          user_id: req.user_id,
          role: "member" as const, // Default role for pending members
          status: "pending_platform_approval", // Custom status for UI
          created_at: req.created_at,
          user: profile
            ? {
                email: profile.email,
                firstName: profile.first_name,
                lastName: profile.last_name,
                jobTitle: profile.job_title,
              }
            : null,
        };
      })
    );

    // Combine approved members with pending platform approval members
    const allMembers = [...enrichedMembers, ...enrichedPendingApprovals];

    return apiResponse({
      requests: enrichedRequests,
      members: allMembers,
    });
  } catch (error) {
    console.error("Get company requests error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
