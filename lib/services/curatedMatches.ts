import { db } from "@/lib/db";
import { curatedMatches, matchingResults } from "@/lib/db/schema/app";
import { and, eq, gt, isNull, or, sql, type SQL } from "drizzle-orm";

/**
 * Read-side overlay for superadmin-curated matches.
 *
 * This module is the single source of truth for what a curated match looks like
 * to a user. Every read surface that exposes a match score has to go through it
 * — the unified feed, the single-tender lookup, the saved-tenders list — because
 * the moment two of them disagree the curation becomes visible. Clicking a card
 * that says 92% through to a detail page that says 12% is the whole failure mode.
 *
 * Semantics:
 *  - Curation is a FLOOR, never a ceiling: `max(realScore, curatedScore)`. It can
 *    only raise a match's rank, which is also what keeps the bounded-window
 *    pagination proof in app/api/tenders/matches/route.ts valid.
 *  - Only `published` curations that haven't expired apply.
 *  - The frozen breakdown is substituted wholesale so the card's sub-scores
 *    reproduce the displayed overall under the real formula.
 */

/** Shape the overlay needs from a curation row. */
export interface CurationOverlayEntry {
  tenderId: string;
  curatedScore: number | null;
  pinned: boolean;
  pinRank: number | null;
  capabilityScore: number | null;
  experienceScore: number | null;
  locationScore: number | null;
  certificationScore: number | null;
  matchReasons: string[] | null;
  summary: string | null;
}

/**
 * A published, unexpired curation. Every user-facing query must AND this in —
 * a draft must never reach a user, and an expired one has to fall away on its
 * own rather than waiting for someone to notice a pinned dead tender.
 */
export function activeCurationCondition(): SQL {
  return and(
    eq(curatedMatches.status, "published"),
    or(isNull(curatedMatches.expiresAt), gt(curatedMatches.expiresAt, sql`now()`))!,
  )!;
}

/**
 * The score a user actually sees for a deep match, as SQL, so filtering,
 * counting and ordering all stay in the database and pagination stays exact.
 *
 * Assumes the query LEFT JOINs `curated_matches` under `activeCurationCondition`
 * — an unjoined or non-curated row falls back to its real score.
 */
export const effectiveScoreSql = sql<number>`GREATEST(COALESCE(${curatedMatches.curatedScore}, 0), COALESCE(${matchingResults.overallScore}, 0))`;

/**
 * Load a company's active curations keyed by tender.
 *
 * Used by the JS-side paths (the basic overlay, the saved-tenders list, the
 * single-tender lookup) that can't express the join inline.
 */
export async function getCurationOverlay(
  companyId: string,
): Promise<Map<string, CurationOverlayEntry>> {
  const rows = await db
    .select({
      tenderId: curatedMatches.tenderId,
      curatedScore: curatedMatches.curatedScore,
      pinned: curatedMatches.pinned,
      pinRank: curatedMatches.pinRank,
      capabilityScore: curatedMatches.curatedCapabilityScore,
      experienceScore: curatedMatches.curatedExperienceScore,
      locationScore: curatedMatches.curatedLocationScore,
      certificationScore: curatedMatches.curatedCertificationScore,
      matchReasons: curatedMatches.curatedMatchReasons,
      summary: curatedMatches.curatedSummary,
    })
    .from(curatedMatches)
    .where(and(eq(curatedMatches.companyId, companyId), activeCurationCondition()));

  return new Map(rows.map((row) => [row.tenderId, row]));
}

/** The subset of a match this overlay is allowed to rewrite. */
export interface CuratableMatch {
  score: number;
  capabilityScore?: number | null;
  experienceScore?: number | null;
  locationScore?: number | null;
  certificationScore?: number | null;
  matchReasons?: string[] | null;
}

/**
 * Apply a curation to a match, in place of the computed values.
 *
 * Floor semantics on the score; the frozen breakdown and reasons are only
 * substituted when the curation actually carries them (evidence-mode curations
 * leave them NULL because the model already produced coherent ones).
 */
/**
 * Whether the curation's score actually stands in for the computed one.
 *
 * False for an evidence-mode curation (no `curatedScore`) and for an override
 * the real score has since overtaken. Everything the curation would substitute
 * — breakdown, reasons, summary — is gated on this, so the card and the detail
 * page can't end up mixing curated prose with real numbers.
 */
export function curationOverridesScore(
  curation: CurationOverlayEntry | undefined,
  realScore: number,
): boolean {
  return !!curation && curation.curatedScore != null && curation.curatedScore >= realScore;
}

export function applyCuration<T extends CuratableMatch>(
  match: T,
  curation: CurationOverlayEntry | undefined,
): T {
  if (!curation) return match;

  const next: T = { ...match };

  if (curation.curatedScore != null) {
    next.score = Math.max(match.score, curation.curatedScore);
  }

  // Only override the breakdown when the curation raised the headline number —
  // otherwise the real, higher score would sit above a frozen breakdown solved
  // for a lower target, and the card would contradict itself the other way.
  const overrodeScore = curationOverridesScore(curation, match.score);

  if (overrodeScore) {
    if (curation.capabilityScore != null) next.capabilityScore = curation.capabilityScore;
    if (curation.experienceScore != null) next.experienceScore = curation.experienceScore;
    if (curation.locationScore != null) next.locationScore = curation.locationScore;
    if (curation.certificationScore != null) {
      next.certificationScore = curation.certificationScore;
    }
    if (curation.matchReasons && curation.matchReasons.length > 0) {
      next.matchReasons = curation.matchReasons;
    }
  }

  return next;
}

/**
 * Substitute the curated summary into an `ai_analysis` payload for the detail
 * page, leaving the per-dimension explanations alone — they're prose about the
 * company, not about the number, so they stay true either way.
 *
 * Gated on the same condition as the breakdown and the reasons: once the real
 * score has overtaken the curated floor, the card reverts to the model's own
 * numbers and reasons, and a curated narrative sitting beside them on the same
 * page is exactly the mismatch this module exists to prevent.
 */
export function applyCurationToAnalysis(
  analysis: unknown,
  curation: CurationOverlayEntry | undefined,
  realScore: number,
): unknown {
  if (!curationOverridesScore(curation, realScore)) return analysis;
  if (!curation?.summary) return analysis;
  const base =
    analysis && typeof analysis === "object" ? (analysis as Record<string, unknown>) : {};
  return { ...base, analysis: curation.summary };
}

/**
 * Curated fields must never appear in a user-facing payload. Called from tests
 * and, in development, from the read routes themselves.
 */
const CURATION_LEAK_KEYS = [
  "curated",
  "curatedScore",
  "curatedMatchReasons",
  "curatedSummary",
  "pinned",
  "pinRank",
  "evidenceNote",
  "internalNote",
];

export function findCurationLeaks(payload: unknown, path = "$"): string[] {
  if (payload == null || typeof payload !== "object") return [];
  if (Array.isArray(payload)) {
    return payload.flatMap((item, i) => findCurationLeaks(item, `${path}[${i}]`));
  }
  const leaks: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (CURATION_LEAK_KEYS.includes(key)) leaks.push(`${path}.${key}`);
    leaks.push(...findCurationLeaks(value, `${path}.${key}`));
  }
  return leaks;
}
