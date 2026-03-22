import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyVerificationRequests, companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

const VALID_ACTIONS = ["approve", "reject", "request_changes"] as const;
type ReviewAction = (typeof VALID_ACTIONS)[number];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { requestId } = await params;
    const body = await request.json();
    const { action, reviewNotes, reviewFeedback } = body as {
      action: ReviewAction;
      reviewNotes?: string;
      reviewFeedback?: unknown;
    };

    if (!action || !VALID_ACTIONS.includes(action)) {
      return apiResponse(
        { error: "action must be 'approve', 'reject', or 'request_changes'" },
        400,
      );
    }

    // Get the verification request
    const verificationRequest = await db
      .select()
      .from(companyVerificationRequests)
      .where(eq(companyVerificationRequests.id, requestId))
      .then((rows) => rows[0]);

    if (!verificationRequest) {
      return apiResponse({ error: "Verification request not found" }, 404);
    }

    if (verificationRequest.status !== "pending") {
      return apiResponse({ error: "This request has already been reviewed" }, 400);
    }

    const now = new Date();
    const statusMap: Record<ReviewAction, string> = {
      approve: "approved",
      reject: "rejected",
      request_changes: "changes_requested",
    };

    // Update the request
    await db
      .update(companyVerificationRequests)
      .set({
        status: statusMap[action],
        reviewNotes: typeof reviewNotes === "string" ? reviewNotes.trim().slice(0, 2000) : null,
        reviewFeedback: reviewFeedback ?? null,
        reviewedBy: user.id,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(companyVerificationRequests.id, requestId));

    // Update company verification status
    if (action === "approve") {
      await db
        .update(companies)
        .set({
          verificationStatus: "verified",
          verifiedAt: now,
          verifiedBy: user.id,
          updatedAt: now,
        })
        .where(eq(companies.id, verificationRequest.companyId));
    } else {
      // Both reject and request_changes reset to unverified
      await db
        .update(companies)
        .set({
          verificationStatus: "unverified",
          updatedAt: now,
        })
        .where(eq(companies.id, verificationRequest.companyId));
    }

    return apiResponse({ success: true, action });
  } catch (error) {
    return handleApiError(error);
  }
}
