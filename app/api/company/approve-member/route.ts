import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { updateCompanyJoinRequest } from "@/lib/db/queries";
import {
  sendEmail,
  getCompanyAdminApprovalEmailSubject,
  getCompanyAdminApprovalEmailHtml,
  getAdminNotificationEmailHtml,
} from "@/lib/email";
import { getEmailLocale } from "@/lib/email/i18n";
import { db } from "@/lib/db";
import { companyJoinRequests, companyMembers, profiles, userRoles } from "@/lib/db/schema/app";
import { eq, and, inArray, desc } from "drizzle-orm";

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
    const { user } = await requireAuth(request);

    const body: ApproveMemberRequest = await request.json();
    const { requestId, approved, rejectionReason } = body;

    if (!requestId) {
      return apiError("Request ID is required", 400);
    }

    // Get join request
    const joinRequestResult = await db
      .select({
        id: companyJoinRequests.id,
        userId: companyJoinRequests.userId,
        companyId: companyJoinRequests.companyId,
        companyNameRequested: companyJoinRequests.companyNameRequested,
        status: companyJoinRequests.status,
      })
      .from(companyJoinRequests)
      .where(eq(companyJoinRequests.id, requestId))
      .limit(1);

    const joinRequest = joinRequestResult[0];
    if (!joinRequest) {
      return apiError("Join request not found", 404);
    }

    // Check if user is admin of this company
    const membershipResult = await db
      .select({ role: companyMembers.role, status: companyMembers.status })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, joinRequest.companyId),
          eq(companyMembers.userId, user.id),
        ),
      )
      .limit(1);

    const membership = membershipResult[0];
    if (!membership || membership.role !== "admin" || membership.status !== "approved") {
      return apiError("You are not authorized to approve members for this company", 403);
    }

    // Check if request is in a valid state
    if (joinRequest.status !== "pending") {
      return apiError(`This request is already ${joinRequest.status}`, 400);
    }

    // Get requester profile
    const requesterProfileResult = await db
      .select({
        email: profiles.email,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
      })
      .from(profiles)
      .where(eq(profiles.userId, joinRequest.userId))
      .limit(1);
    const requesterProfile = requesterProfileResult[0] ?? null;

    // Get current user's profile for admin name
    const adminProfileResult = await db
      .select({ firstName: profiles.firstName, lastName: profiles.lastName })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    const adminProfile = adminProfileResult[0] ?? null;

    const requesterName =
      `${requesterProfile?.firstName || ""} ${requesterProfile?.lastName || ""}`.trim() || "User";
    const adminName =
      `${adminProfile?.firstName || ""} ${adminProfile?.lastName || ""}`.trim() || "Company Admin";

    if (approved) {
      const updated = await updateCompanyJoinRequest(requestId, {
        status: "approved_by_admin",
        adminApprovedAt: new Date(),
        adminApprovedBy: user.id,
      });

      if (!updated) {
        return apiError("Failed to approve member", 500);
      }

      // Send email to requester about partial approval
      if (requesterProfile?.email) {
        const emailData = {
          locale: await getEmailLocale(),
          userName: requesterName,
          companyName: joinRequest.companyNameRequested,
          approvedByCompanyAdmin: true,
          companyAdminName: adminName,
        };

        await sendEmail({
          to: requesterProfile.email,
          subject: getCompanyAdminApprovalEmailSubject(emailData),
          html: getCompanyAdminApprovalEmailHtml(emailData),
        });
      }

      // Notify superadmins
      const superadmins = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.role, "superadmin"));

      if (superadmins.length > 0) {
        const superadminUserIds = superadmins.map((s) => s.userId);
        const superadminProfiles = await db
          .select({ email: profiles.email })
          .from(profiles)
          .where(inArray(profiles.userId, superadminUserIds));

        const adminEmails = superadminProfiles
          .map((p) => p.email)
          .filter(Boolean) as string[];

        if (adminEmails.length > 0) {
          const adminNotificationData = {
            locale: await getEmailLocale(),
            userName: requesterName,
            userEmail: requesterProfile?.email || "",
            signupType: "join-company" as const,
            companyName: joinRequest.companyNameRequested,
          };

          await sendEmail({
            to: adminEmails,
            subject: `[Ready for Approval] Join request approved by ${joinRequest.companyNameRequested}`,
            html: getAdminNotificationEmailHtml(adminNotificationData),
          });
        }
      }

      await logApiEvent(request, {
        actionType: "company_member_approved",
        userId: user.id,
        userEmail: user.email || undefined,
        entityType: "company",
        entityId: joinRequest.companyId,
        details: {
          requestId,
          requesterId: joinRequest.userId,
          requesterName,
          companyName: joinRequest.companyNameRequested,
        },
      });

      return apiResponse<ApproveMemberResponse>({
        success: true,
        message: `${requesterName}'s request has been approved. Awaiting platform admin approval.`,
      });
    } else {
      const rejected = await updateCompanyJoinRequest(requestId, {
        status: "rejected",
        rejectionReason: rejectionReason || "Rejected by company administrator",
        rejectedBy: user.id,
      });

      if (!rejected) {
        return apiError("Failed to reject member", 500);
      }

      if (requesterProfile?.email) {
        const emailData = {
          locale: await getEmailLocale(),
          userName: requesterName,
          companyName: joinRequest.companyNameRequested,
          approvedByCompanyAdmin: false,
          companyAdminName: adminName,
        };

        await sendEmail({
          to: requesterProfile.email,
          subject: getCompanyAdminApprovalEmailSubject(emailData),
          html: getCompanyAdminApprovalEmailHtml(emailData),
        });
      }

      await logApiEvent(request, {
        actionType: "company_member_removed",
        userId: user.id,
        userEmail: user.email || undefined,
        entityType: "company",
        entityId: joinRequest.companyId,
        details: {
          requestId,
          requesterId: joinRequest.userId,
          requesterName,
          rejectionReason: rejectionReason || "Rejected by company administrator",
        },
      });

      return apiResponse<ApproveMemberResponse>({
        success: true,
        message: `${requesterName}'s request has been rejected`,
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}

// GET endpoint to list pending join requests for a company
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    // Get companies where user is an approved member (any role)
    const userMemberships = await db
      .select({ companyId: companyMembers.companyId, role: companyMembers.role })
      .from(companyMembers)
      .where(
        and(
          eq(companyMembers.userId, user.id),
          eq(companyMembers.status, "approved"),
        ),
      );

    if (userMemberships.length === 0) {
      return apiResponse({ requests: [], members: [] });
    }

    const companyIds = userMemberships.map((m) => m.companyId);
    const adminCompanyIds = userMemberships
      .filter((m) => m.role === "admin")
      .map((m) => m.companyId);

    // Get pending join requests only for companies where user is admin
    let joinRequests: {
      id: string;
      userId: string;
      companyId: string;
      companyNameRequested: string;
      message: string | null;
      status: string;
      createdAt: Date;
    }[] = [];

    if (adminCompanyIds.length > 0) {
      joinRequests = await db
        .select({
          id: companyJoinRequests.id,
          userId: companyJoinRequests.userId,
          companyId: companyJoinRequests.companyId,
          companyNameRequested: companyJoinRequests.companyNameRequested,
          message: companyJoinRequests.message,
          status: companyJoinRequests.status,
          createdAt: companyJoinRequests.createdAt,
        })
        .from(companyJoinRequests)
        .where(
          and(
            inArray(companyJoinRequests.companyId, adminCompanyIds),
            eq(companyJoinRequests.status, "pending"),
          ),
        )
        .orderBy(desc(companyJoinRequests.createdAt));
    }

    // Get current members for all companies the user belongs to
    const members = await db
      .select({
        id: companyMembers.id,
        companyId: companyMembers.companyId,
        userId: companyMembers.userId,
        role: companyMembers.role,
        status: companyMembers.status,
        createdAt: companyMembers.createdAt,
      })
      .from(companyMembers)
      .where(
        and(
          inArray(companyMembers.companyId, companyIds),
          eq(companyMembers.status, "approved"),
        ),
      )
      .orderBy(desc(companyMembers.createdAt));

    // Get users pending platform approval
    const pendingPlatformApproval = await db
      .select({
        id: companyJoinRequests.id,
        userId: companyJoinRequests.userId,
        companyId: companyJoinRequests.companyId,
        companyNameRequested: companyJoinRequests.companyNameRequested,
        status: companyJoinRequests.status,
        createdAt: companyJoinRequests.createdAt,
      })
      .from(companyJoinRequests)
      .where(
        and(
          inArray(companyJoinRequests.companyId, companyIds),
          eq(companyJoinRequests.status, "approved_by_admin"),
        ),
      )
      .orderBy(desc(companyJoinRequests.createdAt));

    // Enrich with user profile info
    const enrichWithProfile = async (userId: string) => {
      const result = await db
        .select({
          email: profiles.email,
          firstName: profiles.firstName,
          lastName: profiles.lastName,
          jobTitle: profiles.jobTitle,
        })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);
      const p = result[0];
      return p
        ? { email: p.email, firstName: p.firstName, lastName: p.lastName, jobTitle: p.jobTitle }
        : null;
    };

    const enrichedRequests = await Promise.all(
      joinRequests.map(async (req) => ({
        ...req,
        user: await enrichWithProfile(req.userId),
      })),
    );

    const enrichedMembers = await Promise.all(
      members.map(async (member) => ({
        ...member,
        user: await enrichWithProfile(member.userId),
      })),
    );

    const enrichedPendingApprovals = await Promise.all(
      pendingPlatformApproval.map(async (req) => ({
        id: req.id,
        companyId: req.companyId,
        userId: req.userId,
        role: "member" as const,
        status: "pending_platform_approval",
        createdAt: req.createdAt,
        user: await enrichWithProfile(req.userId),
      })),
    );

    const allMembers = [...enrichedMembers, ...enrichedPendingApprovals];

    return apiResponse({
      requests: enrichedRequests,
      members: allMembers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
