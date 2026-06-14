/**
 * Type definitions for the matching benchmark.
 *
 * A case is a fixed (company, tender) pair plus a list of assertions the model
 * output must satisfy. Cases are frozen on disk in `cases.json` so a benchmark
 * run is reproducible.
 */
import type { AIMatchingScore } from "@/lib/schemas/tenderMatching";

export type ScoreAxis =
  | "capability"
  | "experience"
  | "location"
  | "certification";

/**
 * Discriminated union of assertions.
 *
 * Keep this list small and well-defined. Each assertion is post-evaluated
 * against a single model output (`AIMatchingScore`).
 */
export type Assertion =
  /** Industry mismatch case: capabilityScore MUST be 0. */
  | { kind: "industryMismatch" }
  /** A numeric axis must fall within [min, max] (inclusive on either side). */
  | { kind: "scoreRange"; axis: ScoreAxis; min?: number; max?: number }
  /** `matchReasons` array length within [min, max]. */
  | { kind: "reasonsCount"; min?: number; max?: number }
  /** `improvementSuggestions` array length within [min, max]. */
  | { kind: "suggestionsCount"; min?: number; max?: number };

export interface BenchmarkCase {
  /** Stable identifier (kebab-case). Used in result files; never rename. */
  id: string;
  /** Human-readable label for reports. */
  label: string;
  /** Free-text tags for grouping (e.g. "industry-mismatch", "sparse-data"). */
  tags: string[];
  /** Inline company prompt fragment. */
  company: string;
  /** Inline tender prompt fragment. */
  tender: string;
  /** Optional override system prompt; falls back to the runner's default. */
  systemOverride?: string;
  /** Behavioral assertions. */
  assertions: Assertion[];
  /** Notes for humans reviewing failures. */
  notes?: string;
}

export interface CasesFile {
  /** Bump this if the case schema or interpretation changes. */
  version: number;
  cases: BenchmarkCase[];
}

export interface CaseRunResult {
  ok: boolean;
  ms: number;
  error?: string;
  output?: AIMatchingScore;
}

export interface CaseAggregate {
  caseId: string;
  label: string;
  tags: string[];
  repeats: number;
  schemaValid: number;
  runs: CaseRunResult[];
  mean: Record<ScoreAxis, number>;
  stdev: Record<ScoreAxis, number>;
  assertionsPassed: number;
  assertionsTotal: number;
  /** Per-assertion pass count across repeats, in declaration order. */
  assertionDetails: { description: string; passed: number; total: number }[];
}

export interface BenchmarkResultFile {
  /** Schema version of this result file. Bump on breaking changes. */
  resultsVersion: number;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  git: string;
  createdAt: string;
  repeats: number;
  cases: CaseAggregate[];
  summary: {
    totalCalls: number;
    schemaValidRate: number;
    assertionPassRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
}
