import { NextRequest } from "next/server";
import { apiResponse, apiError, checkSuperadminRole } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  ValidationError,
  isUuid,
} from "@/lib/api/validation";
import { enableEmailSuppression } from "@/lib/email/suppression";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companies, curatedMatches, matchingResults, tenders } from "@/lib/db/schema/app";
import { batchScoreTendersForCompany } from "@/lib/services/tenderMatchingService";
import { checkCurationRealism } from "@/lib/services/curatedMatchScoring";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

/**
 * How many tenders one request may curate at once.
 *
 * Each unanalysed tender in the batch queues a deep-research job, so an
 * unbounded array is an unbounded spend. Fifty is far above any real curation
 * session and still bounded.
 */
const MAX_CURATION_BATCH = 50;

/**
 * Superadmin console for curated matches.
 *
 * Everything here is admin-only by construction: the curation record, the real
 * score it is hiding, the evidence and the internal note never appear on any
 * user-facing route. The read overlay lives in lib/services/curatedMatches.ts.
 */

/** GET /api/admin/curated-matches?companyId= — real score next to shown score. */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    const companyId = new URL(request.url).searchParams.get("companyId");
    if (!companyId) {
      throw new ValidationError("companyId is required");
    }
    if (!isUuid(companyId)) {
      throw new ValidationError("companyId must be a valid id");
    }

    const rows = await db
      .select({
        curation: curatedMatches,
        tender: {
          id: tenders.id,
          title: tenders.title,
          buyer: tenders.buyer,
          deadline: tenders.deadline,
          status: tenders.status,
        },
        realScore: matchingResults.overallScore,
        realCapabilityScore: matchingResults.capabilityScore,
        realExperienceScore: matchingResults.experienceScore,
        realLocationScore: matchingResults.locationScore,
        realCertificationScore: matchingResults.certificationScore,
        realMatchReasons: matchingResults.matchReasons,
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
      .where(eq(curatedMatches.companyId, companyId))
      .orderBy(desc(curatedMatches.pinned), curatedMatches.pinRank, desc(curatedMatches.createdAt));

    // Hoisted out of the map: every row's realism check needs the same view of
    // the company's other published curations.
    const publishedEntries = rows
      .filter((r) => r.curation.status === "published")
      .map((r) => ({ id: r.curation.id, score: r.curation.curatedScore }));

    const results = rows.map((row) => {
      const siblings = publishedEntries.filter((p) => p.id !== row.curation.id);
      return {
        ...row.curation,
        tender: row.tender,
        realScore: row.realScore,
        realBreakdown: {
          capabilityScore: row.realCapabilityScore,
          experienceScore: row.realExperienceScore,
          locationScore: row.realLocationScore,
          certificationScore: row.realCertificationScore,
        },
        realMatchReasons: row.realMatchReasons ?? [],
        /** Whether the deep-research pass has landed yet. */
        hasDeepResult: row.realScore != null,
        realismIssues: checkCurationRealism({
          curatedScore: row.curation.curatedScore,
          realScore: row.realScore,
          breakdown:
            row.curation.curatedCapabilityScore != null
              ? {
                  capabilityScore: row.curation.curatedCapabilityScore,
                  experienceScore: row.curation.curatedExperienceScore ?? 0,
                  locationScore: row.curation.curatedLocationScore ?? 0,
                  certificationScore: row.curation.curatedCertificationScore ?? 0,
                }
              : null,
          tenderDeadline: row.tender.deadline,
          tenderStatus: row.tender.status,
          curationExpiresAt: row.curation.expiresAt,
          siblingScores: siblings
            .map((p) => p.score)
            .filter((s): s is number => s != null),
          siblingCount: siblings.length,
        }),
      };
    });

    return apiResponse({ results });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/admin/curated-matches — start curating a tender for a company.
 *
 * Creates a draft, never a live override: the admin reviews what deep research
 * actually says before anything reaches the owner's feed. When no deep result
 * exists yet one is queued at high priority, so the published card carries a
 * genuine breakdown and genuine reasoning rather than a bare score.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    // A curation re-run must never reach the company owner. Has to be in this
    // frame — see the contract on enableEmailSuppression.
    enableEmailSuppression({ reason: "admin-acting-on-behalf", actorUserId: user.id });

    const body = await request.json();
    const companyId = typeof body.companyId === "string" ? body.companyId : null;
    const rawTenderIds: unknown[] = Array.isArray(body.tenderIds)
      ? body.tenderIds
      : typeof body.tenderId === "string"
        ? [body.tenderId]
        : [];
    // Dedup before the cap so a repeated id can't eat the batch allowance.
    const tenderIds = [...new Set(rawTenderIds.filter(isUuid))];

    if (!companyId) throw new ValidationError("companyId is required");
    if (!isUuid(companyId)) {
      throw new ValidationError("companyId must be a valid id");
    }
    if (tenderIds.length === 0) throw new ValidationError("tenderId is required");
    if (tenderIds.length > MAX_CURATION_BATCH) {
      throw new ValidationError(
        `At most ${MAX_CURATION_BATCH} tenders can be curated in one request`,
      );
    }

    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) return apiError("Company not found", 404);

    const tenderRows = await db
      .select({ id: tenders.id, deadline: tenders.deadline })
      .from(tenders)
      .where(inArray(tenders.id, tenderIds));
    if (tenderRows.length === 0) return apiError("Tender not found", 404);

    // A curation that is already live must not be reopened by re-adding its
    // tender from the picker: that would silently pull it out of the owner's
    // feed. Those rows are returned untouched instead.
    const existing = await db
      .select()
      .from(curatedMatches)
      .where(
        and(
          eq(curatedMatches.companyId, companyId),
          inArray(curatedMatches.tenderId, tenderIds),
        ),
      );
    const alreadyPublished = existing.filter((c) => c.status === "published");
    const publishedTenderIds = new Set(alreadyPublished.map((c) => c.tenderId));
    const toUpsert = tenderRows.filter((t) => !publishedTenderIds.has(t.id));

    const created = toUpsert.length
      ? await db
          .insert(curatedMatches)
          .values(
            toUpsert.map((t) => ({
              companyId,
              tenderId: t.id,
              status: "draft",
              // A curation outlives its usefulness the moment the tender closes,
              // and a pinned dead tender is how this gets noticed. Expiry is the
              // default, not an opt-in.
              expiresAt: t.deadline,
              createdBy: user.id,
              updatedBy: user.id,
            })),
          )
          // Re-curating a tender that was archived or already drafted should
          // reopen that record rather than fail on the unique constraint. The
          // expiry is re-read from the tender in case its deadline moved, and
          // any `publishedAt` left over from an earlier life is cleared.
          .onConflictDoUpdate({
            target: [curatedMatches.companyId, curatedMatches.tenderId],
            set: {
              status: "draft",
              updatedBy: user.id,
              updatedAt: new Date(),
              publishedAt: null,
              expiresAt: sql`excluded.expires_at`,
            },
          })
          .returning()
      : [];

    // Queue deep research for anything that has never been analysed, so the
    // admin has real output to review before publishing.
    const existingDeep = await db
      .select({ tenderId: matchingResults.tenderId })
      .from(matchingResults)
      .where(
        and(
          eq(matchingResults.companyId, companyId),
          inArray(matchingResults.tenderId, tenderIds),
        ),
      );
    const analysed = new Set(existingDeep.map((r) => r.tenderId));
    const toResearch = tenderRows.map((t) => t.id).filter((id) => !analysed.has(id));

    let queued = 0;
    if (toResearch.length > 0) {
      const batch = await batchScoreTendersForCompany(companyId, toResearch, user.id);
      queued = batch.jobCount;
    }

    // The curation is already committed at this point, so a failed audit write
    // must not report the whole request as failed. Logged loudly instead.
    try {
      await logApiEvent(request, {
        actionType: "match_curated",
        userId: user.id,
        entityType: "company",
        entityId: companyId,
        details: {
          tenderIds,
          queuedDeepResearch: queued,
          skippedAlreadyPublished: [...publishedTenderIds],
        },
      });
    } catch (error) {
      console.error("Failed to log match_curated event:", error);
    }

    return apiResponse({
      // Published rows come back as they are so the console still shows them.
      results: [...created, ...alreadyPublished],
      queuedDeepResearch: queued,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
