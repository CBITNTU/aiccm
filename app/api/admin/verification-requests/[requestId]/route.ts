import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companyVerificationRequests, companies } from "@/lib/db/schema/app";
import { user as userTable } from "@/lib/db/schema/auth";
import { eq } from "drizzle-orm";
import {
  sendEmail,
  getVerificationReviewEmailSubject,
  getVerificationReviewEmailHtml,
  type VerificationReviewEmailData,
} from "@/lib/email";

const VALID_ACTIONS = ["approve", "reject", "request_changes"] as const;
type ReviewAction = (typeof VALID_ACTIONS)[number];

type ReviewFeedback = VerificationReviewEmailData["reviewFeedback"];

function isValidReviewFeedback(fb: unknown): fb is ReviewFeedback {
  if (!fb || typeof fb !== "object") return false;
  const obj = fb as Record<string, unknown>;
  if (!Array.isArray(obj.items)) return false;
  for (const item of obj.items) {
    if (typeof item !== "object" || !item) return false;
    const i = item as Record<string, unknown>;
    if (
      typeof i.section !== "string" ||
      typeof i.label !== "string" ||
      typeof i.status !== "string" ||
      typeof i.notes !== "string"
    )
      return false;
  }
  if (obj.overallNotes !== undefined && typeof obj.overallNotes !== "string") return false;
  return true;
}

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

    // Update request and company status atomically
    await db.transaction(async (tx) => {
      await tx
        .update(companyVerificationRequests)
        .set({
          status: statusMap[action],
          reviewNotes: typeof reviewNotes === "string" ? reviewNotes.trim().slice(0, 2000) : null,
          reviewFeedback: isValidReviewFeedback(reviewFeedback) ? reviewFeedback : null,
          reviewedBy: user.id,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(companyVerificationRequests.id, requestId));

      if (action === "approve") {
        await tx
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
        await tx
          .update(companies)
          .set({
            verificationStatus: "unverified",
            updatedAt: now,
          })
          .where(eq(companies.id, verificationRequest.companyId));
      }
    });

    // Send notification email to the submitter
    const [submitter, company] = await Promise.all([
      db
        .select({ name: userTable.name, email: userTable.email })
        .from(userTable)
        .where(eq(userTable.id, verificationRequest.submittedBy))
        .then((r) => r[0]),
      db
        .select({ companyName: companies.companyName })
        .from(companies)
        .where(eq(companies.id, verificationRequest.companyId))
        .then((r) => r[0]),
    ]);

    let emailSent = false;
    if (submitter?.email && company) {
      const emailAction = statusMap[action] as "approved" | "rejected" | "changes_requested";
      try {
        await sendEmail({
          to: submitter.email,
          subject: getVerificationReviewEmailSubject({
            userName: submitter.name,
            companyName: company.companyName,
            action: emailAction,
          }),
          html: getVerificationReviewEmailHtml({
            userName: submitter.name,
            companyName: company.companyName,
            action: emailAction,
            reviewNotes: typeof reviewNotes === "string" ? reviewNotes.trim() : undefined,
            reviewFeedback: action === "request_changes" && isValidReviewFeedback(reviewFeedback) ? reviewFeedback : undefined,
          }),
        });
        emailSent = true;
      } catch (emailError) {
        console.error("Failed to send verification review email:", emailError);
      }
    }

    return apiResponse({ success: true, action, emailSent });
  } catch (error) {
    return handleApiError(error);
  }
}
