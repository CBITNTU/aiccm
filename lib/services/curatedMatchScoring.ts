/**
 * Score arithmetic for curated matches.
 *
 * The match card shows the four sub-scores next to the overall, and the tender
 * detail page repeats them with per-dimension explanations. So an overridden
 * overall score can't just be written on top — it has to be backed by a
 * breakdown that reproduces it under the *real* formula from
 * `tenderMatchingService.scoreTenderMatch`:
 *
 *   capability >= 50  (hard gate, else overall is 0)
 *   overall = round(certification * 0.5 + experience * 0.4 + location * 0.1)
 *
 * A 92% overall sitting next to a 30% capability is arithmetically impossible
 * under that formula, which makes it the most obvious tell there is.
 */

/** Mirrors the weights in tenderMatchingService.ts — keep the two in step. */
export const SCORE_WEIGHTS = {
  certification: 0.5,
  experience: 0.4,
  location: 0.1,
} as const;

/** Below this, `scoreTenderMatch` zeroes the overall score outright. */
export const CAPABILITY_GATE = 50;

/** Scores at or above this read as manufactured rather than merely strong. */
export const REALISM_SCORE_CEILING = 97;

/** A gap wider than this between the real and shown score is hard to defend. */
export const REALISM_MAX_LIFT = 40;

/** Past this many published curations a company's feed stops looking organic. */
export const REALISM_SOFT_CURATION_CAP = 5;

export interface ScoreBreakdown {
  capabilityScore: number;
  experienceScore: number;
  locationScore: number;
  certificationScore: number;
}

type WeightedKey = "certificationScore" | "experienceScore" | "locationScore";

const WEIGHTED_KEYS: ReadonlyArray<{ key: WeightedKey; weight: number }> = [
  { key: "certificationScore", weight: SCORE_WEIGHTS.certification },
  { key: "experienceScore", weight: SCORE_WEIGHTS.experience },
  { key: "locationScore", weight: SCORE_WEIGHTS.location },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The production overall-score formula, replayed. Used both to check a
 * back-solved breakdown and to report what a real breakdown currently yields.
 */
export function computeOverallScore(breakdown: ScoreBreakdown): number {
  if (breakdown.capabilityScore < CAPABILITY_GATE) return 0;
  return Math.round(
    breakdown.certificationScore * SCORE_WEIGHTS.certification +
      breakdown.experienceScore * SCORE_WEIGHTS.experience +
      breakdown.locationScore * SCORE_WEIGHTS.location,
  );
}

/**
 * Produce a breakdown that yields exactly `target` under `computeOverallScore`,
 * staying as close to the real sub-scores as the arithmetic allows.
 *
 * The deficit is spread so that each dimension moves in proportion to
 * `weight * headroom`: the dimension that actually drives the overall score does
 * most of the moving, and a 10%-weight dimension isn't dragged 50 points to buy
 * 5 points of overall. Solving `sum(w_i * d_i) = deficit` with `d_i ∝ w_i *
 * room_i` gives `d_i = deficit * w_i * room_i / sum(w_j^2 * room_j)`.
 *
 * Clamping at 100 leaks some of the deficit, so the distribution runs a few
 * passes; whatever rounding leaves over is settled on the heaviest dimension.
 *
 * Capability is only touched when it sits below the gate — a curated match has
 * to clear it, or the number on the card contradicts the formula behind it.
 */
export function backSolveBreakdown(
  target: number,
  real: ScoreBreakdown,
): ScoreBreakdown {
  const desired = clamp(Math.round(target), 0, 100);

  const result: ScoreBreakdown = {
    capabilityScore: clamp(Math.round(real.capabilityScore), 0, 100),
    experienceScore: clamp(Math.round(real.experienceScore), 0, 100),
    locationScore: clamp(Math.round(real.locationScore), 0, 100),
    certificationScore: clamp(Math.round(real.certificationScore), 0, 100),
  };

  // A curated match must clear the gate. Sit it a little under the target so it
  // reads as "qualified for this work" rather than as a suspicious flat 100.
  if (result.capabilityScore < CAPABILITY_GATE) {
    result.capabilityScore = clamp(desired - 15, CAPABILITY_GATE + 5, 75);
  }

  const weightedSum = () =>
    WEIGHTED_KEYS.reduce((sum, { key, weight }) => sum + result[key] * weight, 0);

  // Curation only ever raises a score — see the floor semantics in
  // lib/services/curatedMatches.ts — so an already-sufficient breakdown is left
  // exactly as the model produced it.
  if (weightedSum() >= desired) return result;

  for (let pass = 0; pass < 4; pass++) {
    const deficit = desired - weightedSum();
    if (deficit <= 0.0001) break;

    const headroom = WEIGHTED_KEYS.map(({ key, weight }) => ({
      key,
      weight,
      room: 100 - result[key],
    }));
    // Denominator of the d_i formula above: sum(w^2 * room).
    const scale = headroom.reduce((sum, h) => sum + h.weight * h.weight * h.room, 0);
    if (scale <= 0.0001) break; // everything is already at 100

    for (const { key, weight, room } of headroom) {
      if (room <= 0) continue;
      result[key] = clamp(
        result[key] + (deficit * weight * room) / scale,
        0,
        100,
      );
    }
  }

  for (const { key } of WEIGHTED_KEYS) {
    result[key] = clamp(Math.round(result[key]), 0, 100);
  }

  // Rounding three dimensions independently can land a point either side of the
  // target. Settle the remainder on certification: at weight 0.5 a single point
  // there moves the overall by half a point, the finest correction available.
  for (let i = 0; i < 4; i++) {
    const drift = desired - computeOverallScore(result);
    if (drift === 0) break;
    const next = clamp(result.certificationScore + Math.sign(drift) * 1, 0, 100);
    if (next === result.certificationScore) break;
    result.certificationScore = next;
  }

  return result;
}

export type RealismSeverity = "block" | "warn";

export interface RealismIssue {
  severity: RealismSeverity;
  /** i18n key under the AdminMatchCuration.realism namespace. */
  code: string;
  /** Interpolation values for the message. */
  values?: Record<string, string | number>;
}

export interface RealismCheckInput {
  curatedScore: number | null;
  realScore: number | null;
  breakdown: ScoreBreakdown | null;
  tenderDeadline: Date | null;
  tenderStatus: string | null;
  /** Scores of the company's other published curations. */
  siblingScores: number[];
  /** How many other curations this company already has published. */
  siblingCount: number;
  now?: Date;
}

/**
 * Guardrails on a curation before it goes live. `block` issues stop a publish;
 * `warn` issues are surfaced to the admin and can be published through.
 */
export function checkCurationRealism(input: RealismCheckInput): RealismIssue[] {
  const issues: RealismIssue[] = [];
  const now = input.now ?? new Date();

  if (input.tenderStatus === "closed") {
    issues.push({ severity: "block", code: "tenderClosed" });
  }

  if (input.tenderDeadline && input.tenderDeadline.getTime() <= now.getTime()) {
    issues.push({ severity: "block", code: "deadlinePassed" });
  }

  if (input.curatedScore != null) {
    if (input.curatedScore > REALISM_SCORE_CEILING) {
      issues.push({
        severity: "warn",
        code: "scoreTooHigh",
        values: { ceiling: REALISM_SCORE_CEILING, score: input.curatedScore },
      });
    }

    if (input.siblingScores.includes(input.curatedScore)) {
      issues.push({
        severity: "warn",
        code: "duplicateScore",
        values: { score: input.curatedScore },
      });
    }

    const lift = input.curatedScore - (input.realScore ?? 0);
    if (lift > REALISM_MAX_LIFT) {
      issues.push({
        severity: "warn",
        code: "liftTooLarge",
        values: { lift, max: REALISM_MAX_LIFT },
      });
    }
  }

  if (input.breakdown) {
    const maxed = (
      ["certificationScore", "experienceScore", "locationScore"] as const
    ).filter((key) => input.breakdown![key] >= 100);
    if (maxed.length > 0) {
      issues.push({
        severity: "warn",
        code: "dimensionMaxed",
        values: { count: maxed.length },
      });
    }
  }

  if (input.siblingCount >= REALISM_SOFT_CURATION_CAP) {
    issues.push({
      severity: "warn",
      code: "tooManyCurations",
      values: { count: input.siblingCount, cap: REALISM_SOFT_CURATION_CAP },
    });
  }

  return issues;
}

export function hasBlockingIssue(issues: RealismIssue[]): boolean {
  return issues.some((issue) => issue.severity === "block");
}
