import { NextRequest } from "next/server";
import { apiResponse, apiError, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, ValidationError } from "@/lib/api/validation";
import { enableEmailSuppression } from "@/lib/email/suppression";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { curatedMatches, matchingResults } from "@/lib/db/schema/app";
import { scoreTenderMatch } from "@/lib/services/tenderMatchingService";
import { and, eq } from "drizzle-orm";

function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalScore(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
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

    const evidenceNote = asOptionalString(body.evidenceNote);
    if (evidenceNote !== undefined) updates.evidenceNote = evidenceNote;

    const internalNote = asOptionalString(body.internalNote);
    if (internalNote !== undefined) updates.internalNote = internalNote;

    const curatedScore = asOptionalScore(body.curatedScore);
    if (curatedScore !== undefined) updates.curatedScore = curatedScore;

    if (typeof body.pinned === "boolean") updates.pinned = body.pinned;
    if (body.pinRank === null) updates.pinRank = null;
    else if (Number.isFinite(Number(body.pinRank))) {
      updates.pinRank = Math.round(Number(body.pinRank));
    }

    if (Array.isArray(body.curatedMatchReasons)) {
      const reasons = body.curatedMatchReasons
        .filter((r: unknown): r is string => typeof r === "string")
        .map((r: string) => r.trim())
        .filter((r: string) => r.length > 0);
      updates.curatedMatchReasons = reasons.length > 0 ? reasons : null;
    }

    const curatedSummary = asOptionalString(body.curatedSummary);
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
      const score = await scoreTenderMatch(existing.companyId, existing.tenderId, {
        force: true,
        evidenceNote: note ?? undefined,
      });
      rerunScore = score.overallScore;
    }

    const [updated] = await db
      .update(curatedMatches)
      .set(updates)
      .where(eq(curatedMatches.id, id))
      .returning();

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

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
