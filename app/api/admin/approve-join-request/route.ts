import { NextRequest } from "next/server";
import {
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  sendEmail,
  getApprovalNotificationEmailSubject,
  getApprovalNotificationEmailHtml,
} from "@/lib/email";
import { getEmailLocale } from "@/lib/email/i18n";
import {
  updateCompanyJoinRequest,
  upsertCompanyMember,
  updateProfileByUserId,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import { companyJoinRequests, profiles } from "@/lib/db/schema/app";
import { eq, inArray, desc } from "drizzle-orm";

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
    const { user } = await requireAuth(request);

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

    // Get join request with user and company info
    const joinRequestRows = await db
      .select({
        id: companyJoinRequests.id,
        userId: companyJoinRequests.userId,
        companyId: companyJoinRequests.companyId,
        companyNameRequested: companyJoinRequests.companyNameRequested,
        status: companyJoinRequests.status,
        adminApprovedAt: companyJoinRequests.adminApprovedAt,
      })
      .from(companyJoinRequests)
      .where(eq(companyJoinRequests.id, requestId))
      .limit(1);

    const joinRequest = joinRequestRows[0];

    if (!joinRequest) {
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
    const profileRows = await db
      .select({
        email: profiles.email,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
      })
      .from(profiles)
      .where(eq(profiles.userId, joinRequest.userId))
      .limit(1);
    const profile = profileRows[0] ?? null;

    const userName =
      `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim() ||
      "User";

    if (approved) {
      // Final approval - update join request status
      const updated = await updateCompanyJoinRequest(requestId, {
        status: "approved",
        superadminApprovedAt: new Date(),
        superadminApprovedBy: user.id,
      });

      if (!updated) {
        console.error("Error approving join request: no rows updated");
        return apiError("Failed to approve join request", 500);
      }

      // Add user to company_members
      await upsertCompanyMember({
        companyId: joinRequest.companyId,
        userId: joinRequest.userId,
        role: "member",
        status: "approved",
        approvedAt: new Date(),
        approvedBy: user.id,
      });

      // Approve the user's profile if still pending
      await updateProfileByUserId(joinRequest.userId, {
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: user.id,
      });

      // Send approval email
      if (profile?.email) {
        const emailData = {
          locale: await getEmailLocale(),
          userName,
          approved: true,
          signupType: "join-company" as const,
          companyName: joinRequest.companyNameRequested,
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
          userId: joinRequest.userId,
          userName,
          companyId: joinRequest.companyId,
          companyName: joinRequest.companyNameRequested,
        },
      });

      return apiResponse<ApproveJoinRequestResponse>({
        success: true,
        message: `${userName} has been approved to join ${joinRequest.companyNameRequested}`,
      });
    } else {
      // Reject the request
      const rejected = await updateCompanyJoinRequest(requestId, {
        status: "rejected",
        rejectionReason: rejectionReason || null,
        rejectedBy: user.id,
      });

      if (!rejected) {
        console.error("Error rejecting join request: no rows updated");
        return apiError("Failed to reject join request", 500);
      }

      // Send rejection email
      if (profile?.email) {
        const emailData = {
          locale: await getEmailLocale(),
          userName,
          approved: false,
          rejectionReason,
          signupType: "join-company" as const,
          companyName: joinRequest.companyNameRequested,
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
          userId: joinRequest.userId,
          userName,
          companyId: joinRequest.companyId,
          companyName: joinRequest.companyNameRequested,
          rejectionReason: rejectionReason || "No reason provided",
        },
      });

      return apiResponse<ApproveJoinRequestResponse>({
        success: true,
        message: `Join request from ${userName} has been rejected`,
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}

// GET endpoint to list pending join requests (for superadmin)
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Check superadmin role
    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    // Get pending join requests (including those awaiting company admin approval)
    const joinRequests = await db
      .select({
        id: companyJoinRequests.id,
        userId: companyJoinRequests.userId,
        companyId: companyJoinRequests.companyId,
        companyNameRequested: companyJoinRequests.companyNameRequested,
        message: companyJoinRequests.message,
        status: companyJoinRequests.status,
        adminApprovedAt: companyJoinRequests.adminApprovedAt,
        adminApprovedBy: companyJoinRequests.adminApprovedBy,
        createdAt: companyJoinRequests.createdAt,
      })
      .from(companyJoinRequests)
      .where(inArray(companyJoinRequests.status, ["pending", "approved_by_admin"]))
      .orderBy(desc(companyJoinRequests.createdAt));

    // Enrich with user profile info
    const enrichedRequests = await Promise.all(
      joinRequests.map(async (req) => {
        const profileRows = await db
          .select({
            email: profiles.email,
            firstName: profiles.firstName,
            lastName: profiles.lastName,
            jobTitle: profiles.jobTitle,
          })
          .from(profiles)
          .where(eq(profiles.userId, req.userId))
          .limit(1);
        const profile = profileRows[0] ?? null;

        return {
          ...req,
          user: profile
            ? {
                email: profile.email,
                firstName: profile.firstName,
                lastName: profile.lastName,
                jobTitle: profile.jobTitle,
              }
            : null,
        };
      }),
    );

    return apiResponse({ requests: enrichedRequests });
  } catch (error) {
    return handleApiError(error);
  }
}
