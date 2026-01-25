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

export interface ApproveJoinRequestRequest {
  requestId: string;
  approved: boolean;
  rejectionReason?: string;
}

export interface ApproveJoinRequestResponse {
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

    const body: ApproveJoinRequestRequest = await request.json();
    const { requestId, approved, rejectionReason } = body;

    if (!requestId) {
      return apiError("Request ID is required", 400);
    }

    const supabase = createAdminClient();

    // Get join request with user and company info
    const { data: joinRequest, error: requestError } = await supabase
      .from("company_join_requests")
      .select(`
        id,
        user_id,
        company_id,
        company_name_requested,
        status,
        admin_approved_at
      `)
      .eq("id", requestId)
      .single();

    if (requestError || !joinRequest) {
      return apiError("Join request not found", 404);
    }

    // Check if request is in a valid state for superadmin approval
    if (joinRequest.status === "approved") {
      return apiError("This request has already been fully approved", 400);
    }

    if (joinRequest.status === "rejected") {
      return apiError("This request has already been rejected", 400);
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("user_id", joinRequest.user_id)
      .single();

    const userName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "User";

    if (approved) {
      // Final approval - update join request status
      const { error: updateError } = await supabase
        .from("company_join_requests")
        .update({
          status: "approved",
          superadmin_approved_at: new Date().toISOString(),
          superadmin_approved_by: user.id,
        })
        .eq("id", requestId);

      if (updateError) {
        console.error("Error approving join request:", updateError);
        return apiError("Failed to approve join request", 500);
      }

      // Add user to company_members
      await supabase.from("company_members").upsert(
        {
          company_id: joinRequest.company_id,
          user_id: joinRequest.user_id,
          role: "member",
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        },
        {
          onConflict: "company_id,user_id",
        }
      );

      // Approve the user's profile if still pending
      await supabase
        .from("profiles")
        .update({
          approval_status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user.id,
        })
        .eq("user_id", joinRequest.user_id)
        .eq("approval_status", "pending");

      // Send approval email
      if (profile?.email) {
        const emailData = {
          userName,
          approved: true,
          signupType: "join-company" as const,
          companyName: joinRequest.company_name_requested,
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
        entityType: "company_join_request",
        entityId: requestId,
        details: {
          joinRequestId: requestId,
          userId: joinRequest.user_id,
          userName,
          companyId: joinRequest.company_id,
          companyName: joinRequest.company_name_requested,
        },
      });

      return apiResponse<ApproveJoinRequestResponse>({
        success: true,
        message: `${userName} has been approved to join ${joinRequest.company_name_requested}`,
      });
    } else {
      // Reject the request
      const { error: updateError } = await supabase
        .from("company_join_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason || null,
          rejected_by: user.id,
        })
        .eq("id", requestId);

      if (updateError) {
        console.error("Error rejecting join request:", updateError);
        return apiError("Failed to reject join request", 500);
      }

      // Send rejection email
      if (profile?.email) {
        const emailData = {
          userName,
          approved: false,
          rejectionReason,
          signupType: "join-company" as const,
          companyName: joinRequest.company_name_requested,
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
        entityType: "company_join_request",
        entityId: requestId,
        details: {
          joinRequestId: requestId,
          userId: joinRequest.user_id,
          userName,
          companyId: joinRequest.company_id,
          companyName: joinRequest.company_name_requested,
          rejectionReason: rejectionReason || "No reason provided",
        },
      });

      return apiResponse<ApproveJoinRequestResponse>({
        success: true,
        message: `Join request from ${userName} has been rejected`,
      });
    }
  } catch (error) {
    console.error("Approve join request error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}

// GET endpoint to list pending join requests (for superadmin)
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

    // Get pending join requests (including those awaiting company admin approval)
    const { data: joinRequests, error } = await supabase
      .from("company_join_requests")
      .select(`
        id,
        user_id,
        company_id,
        company_name_requested,
        message,
        status,
        admin_approved_at,
        admin_approved_by,
        created_at
      `)
      .in("status", ["pending", "approved_by_admin"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching join requests:", error);
      return apiError("Failed to fetch join requests", 500);
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

    return apiResponse({ requests: enrichedRequests });
  } catch (error) {
    console.error("Get join requests error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
