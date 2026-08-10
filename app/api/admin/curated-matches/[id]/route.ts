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
import { curatedMatches, matchingResults } from "@/lib/db/schema/app";
import {
  parseEvidenceDimensions,
  scoreTenderMatch,
} from "@/lib/services/tenderMatchingService";
import { and, eq } from "drizzle-orm";

/**
 * Free-text ceilings. `evidenceNote` is interpolated into the deep-research
 * prompt, so an unbounded value is an unbounded token bill; the rest are stored
 * and rendered on a card.
 */
const MAX_EVIDENCE_NOTE = 4000;
const MAX_INTERNAL_NOTE = 2000;
const MAX_SUMMARY = 2000;
const MAX_REASON = 500;
const MAX_REASONS = 12;

function asOptionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalScore(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = Number(value);
  // Silently dropping a malformed score would leave the admin looking at a
  // number the row never took.
  if (typeof value === "boolean" || !Number.isFinite(n)) {
    throw new ValidationError("curatedScore must be a number between 1 and 100");
  }
  // A curated score below 1 would be swallowed by the feed's own 0% floor and
  // silently reclassify the tender as ruled out.
  return Math.min(Math.max(Math.round(n), 1), 100);
}

/**
 * PATCH /api/admin/curated-matches/[id]
 *
 * Edits a draft (or a live curation). With `rerun: true` this re-runs deep
 * research with the evidence note attached — the preferred path, since the model
 * then produces a genuinely higher score with reasoning that stands behind it.
 * A direct `curatedScore` is the fallback for when evidence doesn't get there.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    if (!(await checkSuperadminRole(user.id))) {
      return apiError("Forbidden: Superadmin access required", 403);
    }

    // Re-running analysis on someone's behalf must not email them. Has to be in
    // this frame — see the contract on enableEmailSuppression.
    enableEmailSuppression({ reason: "admin-acting-on-behalf", actorUserId: user.id });

    const { id } = await params;
    if (!isUuid(id)) return apiError("Curation not found", 404);

    const body = await request.json();

    const [existing] = await db
      .select()
      .from(curatedMatches)
      .where(eq(curatedMatches.id, id))
      .limit(1);
    if (!existing) return apiError("Curation not found", 404);

    const updates: Partial<typeof curatedMatches.$inferInsert> = {
      updatedBy: user.id,
      updatedAt: new Date(),
    };

    const evidenceNote = asOptionalString(
      body.evidenceNote,
      "evidenceNote",
      MAX_EVIDENCE_NOTE,
    );
    if (evidenceNote !== undefined) updates.evidenceNote = evidenceNote;

    // Unknown entries are dropped rather than rejected — the set is a whitelist
    // in tenderMatchingService, so anything else could only widen the lift.
    const evidenceDimensions = Array.isArray(body.evidenceDimensions)
      ? parseEvidenceDimensions(body.evidenceDimensions)
      : undefined;
    if (evidenceDimensions !== undefined) {
      updates.evidenceDimensions = evidenceDimensions;
    }

    const internalNote = asOptionalString(
      body.internalNote,
      "internalNote",
      MAX_INTERNAL_NOTE,
    );
    if (internalNote !== undefined) updates.internalNote = internalNote;

    const curatedScore = asOptionalScore(body.curatedScore);
    if (curatedScore !== undefined) updates.curatedScore = curatedScore;

    if (typeof body.pinned === "boolean") updates.pinned = body.pinned;
    if (body.pinRank === null) updates.pinRank = null;
    else if (body.pinRank !== undefined) {
      // `Number("")`, `Number([])` and `Number(true)` are all finite, so the
      // type has to be checked before the value.
      const rank = Number(body.pinRank);
      if (typeof body.pinRank !== "number" || !Number.isFinite(rank)) {
        throw new ValidationError("pinRank must be a number or null");
      }
      updates.pinRank = Math.round(rank);
    }

    if (Array.isArray(body.curatedMatchReasons)) {
      const reasons = body.curatedMatchReasons
        .filter((r: unknown): r is string => typeof r === "string")
        .map((r: string) => r.trim().slice(0, MAX_REASON))
        .filter((r: string) => r.length > 0)
        .slice(0, MAX_REASONS);
      updates.curatedMatchReasons = reasons.length > 0 ? reasons : null;
    }

    const curatedSummary = asOptionalString(
      body.curatedSummary,
      "curatedSummary",
      MAX_SUMMARY,
    );
    if (curatedSummary !== undefined) updates.curatedSummary = curatedSummary;

    if (body.expiresAt === null) updates.expiresAt = null;
    else if (typeof body.expiresAt === "string") {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new ValidationError("expiresAt must be a valid date");
      }
      updates.expiresAt = parsed;
    }

    // Evidence mode: re-score with the admin's context folded into the prompt.
    // `force` is required — a cached row would otherwise short-circuit the call
    // and the evidence would never reach the model.
    let rerunScore: number | null = null;
    if (body.rerun === true) {
      const note = evidenceNote !== undefined ? evidenceNote : existing.evidenceNote;
      const dimensions =
        evidenceDimensions !== undefined
          ? evidenceDimensions
          : parseEvidenceDimensions(existing.evidenceDimensions);
      const score = await scoreTenderMatch(existing.companyId, existing.tenderId, {
        force: true,
        evidenceNote: note ?? undefined,
        evidenceDimensions: dimensions,
      });
      rerunScore = score.overallScore;
    }

    const [updated] = await db
      .update(curatedMatches)
      .set(updates)
      .where(eq(curatedMatches.id, id))
      .returning();

    // The edit is committed; a failed audit write must not report it as failed.
    try {
      await logApiEvent(request, {
        actionType: "match_curated",
        userId: user.id,
        entityType: "curated_match",
        entityId: id,
        details: {
          companyId: existing.companyId,
          tenderId: existing.tenderId,
          curatedScore: updated.curatedScore,
          pinned: updated.pinned,
          rerun: body.rerun === true,
          rerunScore,
        },
      });
    } catch (error) {
      console.error("Failed to log match_curated event:", error);
    }

    return apiResponse({ result: updated, rerunScore });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/admin/curated-matches/[id] — remove the override entirely. */
export async function DELETE(
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

    const [deleted] = await db
      .delete(curatedMatches)
      .where(eq(curatedMatches.id, id))
      .returning();
    if (!deleted) return apiError("Curation not found", 404);

    // The real analysis is untouched by curation, so removing the override just
    // returns the tender to whatever the matcher scored it at.
    const [real] = await db
      .select({ overallScore: matchingResults.overallScore })
      .from(matchingResults)
      .where(
        and(
          eq(matchingResults.companyId, deleted.companyId),
          eq(matchingResults.tenderId, deleted.tenderId),
        ),
      )
      .limit(1);

    // The row is already gone; a failed audit write must not report otherwise.
    try {
      await logApiEvent(request, {
        actionType: "match_curation_deleted",
        userId: user.id,
        entityType: "curated_match",
        entityId: id,
        details: {
          companyId: deleted.companyId,
          tenderId: deleted.tenderId,
          curatedScore: deleted.curatedScore,
          realScore: real?.overallScore ?? null,
        },
      });
    } catch (error) {
      console.error("Failed to log match_curation_deleted event:", error);
    }

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
