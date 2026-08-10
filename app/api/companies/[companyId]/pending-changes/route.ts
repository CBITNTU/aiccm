import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import {
  requireCompanyAccess,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { companies, companyVerificationRequests } from "@/lib/db/schema/app";
import { eq, and, inArray } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await params;

    // No `markCompanyAdminPrepared` here: that marker means "the admin curated
    // values worth preserving through approval", and discarding a draft is the
    // opposite. The pending-review guard below is deliberately NOT bypassed for
    // `adminOverride` either — discarding under a submitted review would strand
    // the request.
    const access = await requireCompanyAccess(user.id, companyId);
    // Must be in this frame — see enableEmailSuppression's contract.
    suppressEmailForAdminOverride(access, user.id);

    // Check for pending change_review — can't discard while submitted
    const pendingRequest = await db
      .select({ id: companyVerificationRequests.id })
      .from(companyVerificationRequests)
      .where(
        and(
          eq(companyVerificationRequests.companyId, companyId),
          eq(companyVerificationRequests.requestType, "change_review"),
          eq(companyVerificationRequests.status, "pending"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (pendingRequest) {
      return apiResponse(
        { error: "Cannot discard changes while a review is pending. Please wait for admin review." },
        400,
      );
    }

    await db
      .update(companies)
      .set({ pendingChanges: null, updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    // Dismiss any stale rejected/changes_requested requests since user is discarding those changes
    await db
      .update(companyVerificationRequests)
      .set({ status: "dismissed", updatedAt: new Date() })
      .where(
        and(
          eq(companyVerificationRequests.companyId, companyId),
          eq(companyVerificationRequests.requestType, "change_review"),
          inArray(companyVerificationRequests.status, ["changes_requested", "rejected"]),
        ),
      );

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
