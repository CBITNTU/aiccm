import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  AuthError,
  isUuid,
} from "@/lib/api/validation";
import {
  getCompanyAccess,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { logEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { curatedMatches, matchingResults } from "@/lib/db/schema/app";
import { and, eq } from "drizzle-orm";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ resultId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { resultId } = await params;

    // A non-uuid would reach Postgres as a failed cast and surface as a 500.
    if (!isUuid(resultId)) {
      throw new AuthError("Matching result not found");
    }

    // Fetch the matching result's company
    const result = await db
      .select({
        companyId: matchingResults.companyId,
        tenderId: matchingResults.tenderId,
      })
      .from(matchingResults)
      .where(eq(matchingResults.id, resultId))
      .limit(1);

    if (!result[0]) {
      throw new AuthError("Matching result not found");
    }

    // Owner, approved member, or a superadmin preparing the account.
    const access = await getCompanyAccess(user.id, result[0].companyId);
    if (!access.hasAccess) {
      throw new AuthError("No access to this matching result");
    }
    // Must be in this frame — see enableEmailSuppression's contract.
    suppressEmailForAdminOverride(access, user.id);

    await db.delete(matchingResults).where(eq(matchingResults.id, resultId));

    // Dismissing a match has to stick. A live curation would otherwise re-render
    // the tender on the next load as a synthesized card, and a "deleted" result
    // coming back is the loudest possible tell that something is overriding the
    // feed. Archiving keeps the admin's work recoverable in the console.
    const [archived] = await db
      .update(curatedMatches)
      .set({ status: "archived", updatedAt: new Date(), updatedBy: user.id })
      .where(
        and(
          eq(curatedMatches.companyId, result[0].companyId),
          eq(curatedMatches.tenderId, result[0].tenderId),
        ),
      )
      .returning({ id: curatedMatches.id, status: curatedMatches.status });

    // A dismissal is the one way a curation leaves the feed without an admin
    // touching it, so it needs to appear in the same audit trail as the rest of
    // the curation lifecycle. Best-effort: the dismissal itself already stands.
    if (archived) {
      try {
        await logEvent({
          actionType: "match_curation_archived",
          userId: user.id,
          entityType: "curated_match",
          entityId: archived.id,
          details: {
            companyId: result[0].companyId,
            tenderId: result[0].tenderId,
            reason: "match_dismissed_by_user",
          },
        });
      } catch (error) {
        console.error("Failed to log curation archive event:", error);
      }
    }

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
