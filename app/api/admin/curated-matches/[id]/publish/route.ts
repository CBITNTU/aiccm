import { NextRequest } from "next/server";
import { apiResponse, apiError, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, isUuid } from "@/lib/api/validation";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { curatedMatches, matchingResults, tenders } from "@/lib/db/schema/app";
import {
  backSolveBreakdown,
  checkCurationRealism,
  computeOverallScore,
  hasBlockingIssue,
} from "@/lib/services/curatedMatchScoring";
import { and, eq, ne } from "drizzle-orm";

/**
 * POST /api/admin/curated-matches/[id]/publish
 *
 * Takes a curation live. Two things happen that can't happen anywhere else:
 *
 * 1. The realism guardrails run. A closed tender or a passed deadline blocks the
 *    publish outright — a pinned dead tender is the fastest way for a user to
 *    work out that the feed is being shaped.
 * 2. The back-solved breakdown is computed once and frozen on the row. It has to
 *    be frozen rather than derived per request, because the list card and the
 *    detail page would otherwise be free to drift apart.
 *
 * `?force=1` publishes through warnings; blocking issues are never overridable.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const { id } = await params;
    if (!isUuid(id)) return apiError("Curation not found", 404);

    const acknowledgeWarnings =
      new URL(request.url).searchParams.get("force") === "1";

    const [row] = await db
      .select({
        curation: curatedMatches,
        tenderDeadline: tenders.deadline,
        tenderStatus: tenders.status,
        realScore: matchingResults.overallScore,
        realCapability: matchingResults.capabilityScore,
        realExperience: matchingResults.experienceScore,
        realLocation: matchingResults.locationScore,
        realCertification: matchingResults.certificationScore,
      })
      .from(curatedMatches)
      .innerJoin(tenders, eq(curatedMatches.tenderId, tenders.id))
      .leftJoin(
        matchingResults,
        and(
          eq(matchingResults.companyId, curatedMatches.companyId),
          eq(matchingResults.tenderId, curatedMatches.tenderId),
        ),
      )
      .where(eq(curatedMatches.id, id))
      .limit(1);

    if (!row) return apiError("Curation not found", 404);

    const { curation } = row;

    // `archived` is a retirement, not a holding state: the dismiss path in
    // /api/matching-results/[resultId] uses it to record that the user threw
    // this match away. Bringing it back has to be a deliberate re-draft in the
    // console, not a publish call against a stale id.
    if (curation.status === "archived") {
      return apiError(
        "This curation was archived — reopen it as a draft before publishing",
        409,
      );
    }

    const siblings = await db
      .select({ curatedScore: curatedMatches.curatedScore })
      .from(curatedMatches)
      .where(
        and(
          eq(curatedMatches.companyId, curation.companyId),
          eq(curatedMatches.status, "published"),
          ne(curatedMatches.id, id),
        ),
      );

    const realBreakdown = {
      capabilityScore: row.realCapability ?? 0,
      experienceScore: row.realExperience ?? 0,
      locationScore: row.realLocation ?? 0,
      certificationScore: row.realCertification ?? 0,
    };

    // Only an override needs a synthetic breakdown. An evidence-mode curation
    // carries no curatedScore, so the model's own numbers stand and stay
    // internally consistent on their own.
    const breakdown =
      curation.curatedScore != null
        ? backSolveBreakdown(curation.curatedScore, realBreakdown)
        : null;

    const issues = checkCurationRealism({
      curatedScore: curation.curatedScore,
      realScore: row.realScore,
      breakdown,
      tenderDeadline: row.tenderDeadline,
      tenderStatus: row.tenderStatus,
      curationExpiresAt: curation.expiresAt,
      siblingScores: siblings
        .map((s) => s.curatedScore)
        .filter((s): s is number => s != null),
      siblingCount: siblings.length,
    });

    if (hasBlockingIssue(issues)) {
      return apiResponse({ published: false, issues }, 409);
    }
    if (issues.length > 0 && !acknowledgeWarnings) {
      return apiResponse({ published: false, issues, needsAcknowledgement: true }, 409);
    }

    const [updated] = await db
      .update(curatedMatches)
      .set({
        status: "published",
        // Re-publishing an already-live curation shouldn't rewrite when it first
        // went live — the audit trail depends on that timestamp.
        publishedAt: curation.publishedAt ?? new Date(),
        updatedBy: user.id,
        updatedAt: new Date(),
        curatedCapabilityScore: breakdown?.capabilityScore ?? null,
        curatedExperienceScore: breakdown?.experienceScore ?? null,
        curatedLocationScore: breakdown?.locationScore ?? null,
        curatedCertificationScore: breakdown?.certificationScore ?? null,
      })
      .where(eq(curatedMatches.id, id))
      .returning();

    // The curation is live at this point; a failed audit write must not report
    // the publish as having failed.
    try {
      await logApiEvent(request, {
        actionType: "match_curation_published",
        userId: user.id,
        entityType: "curated_match",
        entityId: id,
        details: {
          companyId: curation.companyId,
          tenderId: curation.tenderId,
          realScore: row.realScore,
          shownScore: curation.curatedScore ?? row.realScore,
          mode: curation.curatedScore != null ? "override" : "evidence",
          pinned: curation.pinned,
          internalNote: curation.internalNote,
          acknowledgedWarnings: issues.map((i) => i.code),
        },
      });
    } catch (error) {
      console.error("Failed to log match_curation_published event:", error);
    }

    return apiResponse({
      published: true,
      result: updated,
      issues,
      // What the card will actually show, so the console can confirm the
      // breakdown reproduces the headline number under the real formula.
      verifiedOverall: breakdown ? computeOverallScore(breakdown) : row.realScore,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
