import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  companyVerificationRequests,
  companies,
  companyCapabilities,
  companyMarkets,
  companyStandards,
} from "@/lib/db/schema/app";
import { user as userTable } from "@/lib/db/schema/auth";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import { eq, and, inArray } from "drizzle-orm";
import type { PendingChanges } from "@/lib/companyFieldCategories";
import { REVIEWABLE_SCALAR_FIELDS } from "@/lib/companyFieldCategories";
import {
  sendEmail,
  getVerificationReviewEmailSubject,
  getVerificationReviewEmailHtml,
  type VerificationReviewEmailData,
} from "@/lib/email";
import { getEmailLocale } from "@/lib/email/i18n";

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

    const isChangeReview = verificationRequest.requestType === "change_review";

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

      if (isChangeReview) {
        // Change review: company stays verified, apply/clear pendingChanges
        if (action === "approve") {
          const snapshot = verificationRequest.pendingChangesSnapshot as PendingChanges | null;
          if (snapshot) {
            // Apply scalar field changes
            if (snapshot.scalarFields) {
              const scalarUpdates: Partial<typeof companies.$inferInsert> = {};
              for (const field of REVIEWABLE_SCALAR_FIELDS) {
                if (snapshot.scalarFields[field]) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (scalarUpdates as any)[field] = snapshot.scalarFields[field].proposed;
                }
              }
              if (Object.keys(scalarUpdates).length > 0) {
                await tx
                  .update(companies)
                  .set({ ...scalarUpdates, updatedAt: now })
                  .where(eq(companies.id, verificationRequest.companyId));
              }
            }

            // Apply capability changes
            if (snapshot.capabilities) {
              if (snapshot.capabilities.removed.length > 0) {
                await tx
                  .delete(companyCapabilities)
                  .where(
                    and(
                      eq(companyCapabilities.companyId, verificationRequest.companyId),
                      inArray(companyCapabilities.capabilityId, snapshot.capabilities.removed),
                    ),
                  );
              }
              if (snapshot.capabilities.added.length > 0) {
                await tx.insert(companyCapabilities).values(
                  snapshot.capabilities.added.map((capabilityId) => ({
                    companyId: verificationRequest.companyId,
                    capabilityId,
                  })),
                );
              }
            }

            // Apply market changes
            if (snapshot.markets) {
              if (snapshot.markets.removed.length > 0) {
                await tx
                  .delete(companyMarkets)
                  .where(
                    and(
                      eq(companyMarkets.companyId, verificationRequest.companyId),
                      inArray(companyMarkets.marketId, snapshot.markets.removed),
                    ),
                  );
              }
              if (snapshot.markets.added.length > 0) {
                await tx.insert(companyMarkets).values(
                  snapshot.markets.added.map((marketId) => ({
                    companyId: verificationRequest.companyId,
                    marketId,
                  })),
                );
              }
            }

            // Apply standard changes
            if (snapshot.standards) {
              if (snapshot.standards.removed.length > 0) {
                await tx
                  .delete(companyStandards)
                  .where(
                    and(
                      eq(companyStandards.companyId, verificationRequest.companyId),
                      inArray(companyStandards.standardId, snapshot.standards.removed),
                    ),
                  );
              }
              if (snapshot.standards.added.length > 0) {
                await tx.insert(companyStandards).values(
                  snapshot.standards.added.map((standardId) => ({
                    companyId: verificationRequest.companyId,
                    standardId,
                  })),
                );
              }
            }
          }
          // Clear pendingChanges — company stays verified
          await tx
            .update(companies)
            .set({ pendingChanges: null, updatedAt: now })
            .where(eq(companies.id, verificationRequest.companyId));
        } else if (action === "reject") {
          // Reject: keep pendingChanges so user can see what was rejected and modify/discard
          await tx
            .update(companies)
            .set({ updatedAt: now })
            .where(eq(companies.id, verificationRequest.companyId));
        } else {
          // Request changes: keep pendingChanges intact so user can edit and resubmit
          // Company stays verified, just update timestamp
          await tx
            .update(companies)
            .set({ updatedAt: now })
            .where(eq(companies.id, verificationRequest.companyId));
        }
      } else {
        // Initial verification: original behavior
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
      }
    });

    // Approving a change review is the moment a verified company's queued edits
    // (scalars, capabilities, markets, standards) actually land in the columns,
    // so the vector is stale until now. After the transaction: the embed does a
    // provider round-trip and must not hold a DB transaction open.
    if (isChangeReview && action === "approve") {
      await refreshCompanyEmbedding(verificationRequest.companyId);
    }

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
      const emailLocale = await getEmailLocale();
      try {
        await sendEmail({
          to: submitter.email,
          subject: getVerificationReviewEmailSubject({
            locale: emailLocale,
            userName: submitter.name,
            companyName: company.companyName,
            action: emailAction,
          }),
          html: getVerificationReviewEmailHtml({
            locale: emailLocale,
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
