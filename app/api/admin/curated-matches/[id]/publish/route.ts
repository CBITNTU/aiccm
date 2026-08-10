import { NextRequest } from "next/server";
import { apiResponse, apiError, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
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
        publishedAt: new Date(),
        updatedBy: user.id,
        updatedAt: new Date(),
        curatedCapabilityScore: breakdown?.capabilityScore ?? null,
        curatedExperienceScore: breakdown?.experienceScore ?? null,
        curatedLocationScore: breakdown?.locationScore ?? null,
        curatedCertificationScore: breakdown?.certificationScore ?? null,
      })
      .where(eq(curatedMatches.id, id))
      .returning();

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
