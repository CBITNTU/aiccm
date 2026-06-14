/**
 * Matching benchmark runner.
 *
 * - Loads frozen cases from `cases.json` (+ `cases-real.json` if present).
 * - For each case, runs the model R times through the SAME code path as
 *   production (Vercel AI SDK `generateObject` + Zod schema).
 * - Evaluates behavioral assertions per repeat.
 * - Writes a timestamped result file to `benchmarks/matching/results/`.
 *
 * Usage:
 *   MATCHING_MODEL=ollama/qwen2.5:7b ./node_modules/.bin/tsx benchmarks/matching/run.ts
 *   REPEATS=5 ./node_modules/.bin/tsx benchmarks/matching/run.ts
 *   CASES=construction-nhs-me-same-city,it-vs-construction-mismatch ./node_modules/.bin/tsx benchmarks/matching/run.ts
 *   NO_THINK=1 ./node_modules/.bin/tsx benchmarks/matching/run.ts   # injects /no_think for Qwen 3/3.5
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateObject, zodSchema } from "ai";

import {
  matchingScoreSchema,
  type AIMatchingScore,
} from "@/lib/schemas/tenderMatching";
import { resolveModel } from "@/lib/ai/models";

import type {
  Assertion,
  BenchmarkCase,
  BenchmarkResultFile,
  CaseAggregate,
  CaseRunResult,
  CasesFile,
  ScoreAxis,
} from "./types";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Versioning. Bump these when prompts / schema / runner change so old results
// remain identifiable and we don't accidentally compare apples to oranges.
// ---------------------------------------------------------------------------
const PROMPT_VERSION = "v1";
const SCHEMA_VERSION = "matchingScoreSchema@v1";
const RESULTS_VERSION = 1;

const SYSTEM_PROMPT = `You are an expert at evaluating company-tender matches.

FIRST: Check if company and tender industries/sectors match (e.g., construction, healthcare, IT, telecom). If industries DON'T MATCH, set capabilityScore = 0 immediately. If industries match, rate capability relevance 0-100. Then rate Certification, Experience, Location 0-100 independently. No assumptions.

For matchReasons: Provide 2-4 SHORT, CLEAR bullet points (10-15 words each).
For improvementSuggestions: Provide 2-3 SHORT, ACTIONABLE suggestions (10-15 words each).
For aiAnalysis: a brief summary.
For scoreExplanations: a short string for each of capability, experience, location, certification.`;

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------
const modelId = process.env.MATCHING_MODEL?.trim() || "ollama/qwen2.5:7b";
const repeats = Math.max(1, Number(process.env.REPEATS) || 3);
const caseFilter = process.env.CASES?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// Qwen 3 / 3.5 thinking mode soft-switch. Injecting /no_think disables the
// reasoning trace via the OpenAI-compatible Ollama endpoint (which doesn't
// honour the native `think: false` parameter).
const noThink = process.env.NO_THINK === "1" || process.env.NO_THINK === "true";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const AXES: ScoreAxis[] = [
  "capability",
  "experience",
  "location",
  "certification",
];

function axisScore(s: AIMatchingScore, axis: ScoreAxis): number {
  switch (axis) {
    case "capability":
      return s.capabilityScore;
    case "experience":
      return s.experienceScore;
    case "location":
      return s.locationScore;
    case "certification":
      return s.certificationScore;
  }
}

function describeAssertion(a: Assertion): string {
  switch (a.kind) {
    case "industryMismatch":
      return "capability === 0 (industry mismatch)";
    case "scoreRange": {
      const parts: string[] = [];
      if (a.min != null) parts.push(`>= ${a.min}`);
      if (a.max != null) parts.push(`<= ${a.max}`);
      return `${a.axis} ${parts.join(" and ") || "any"}`;
    }
    case "reasonsCount":
      return `matchReasons count ${a.min ?? 0}..${a.max ?? "∞"}`;
    case "suggestionsCount":
      return `improvementSuggestions count ${a.min ?? 0}..${a.max ?? "∞"}`;
  }
}

function evalAssertion(a: Assertion, out: AIMatchingScore): boolean {
  switch (a.kind) {
    case "industryMismatch":
      return out.capabilityScore === 0;
    case "scoreRange": {
      const v = axisScore(out, a.axis);
      if (a.min != null && v < a.min) return false;
      if (a.max != null && v > a.max) return false;
      return true;
    }
    case "reasonsCount": {
      const n = out.matchReasons.length;
      if (a.min != null && n < a.min) return false;
      if (a.max != null && n > a.max) return false;
      return true;
    }
    case "suggestionsCount": {
      const n = out.improvementSuggestions.length;
      if (a.min != null && n < a.min) return false;
      if (a.max != null && n > a.max) return false;
      return true;
    }
  }
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance =
    xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function loadCases(): BenchmarkCase[] {
  const baseDir = __dirname;
  const files = ["cases.json", "cases-real.json"]
    .map((f) => resolve(baseDir, f))
    .filter((f) => existsSync(f));
  const all: BenchmarkCase[] = [];
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(f, "utf8")) as CasesFile;
    all.push(...parsed.cases);
  }
  if (caseFilter) {
    return all.filter((c) => caseFilter.includes(c.id));
  }
  return all;
}

// ---------------------------------------------------------------------------
// Run one case once
// ---------------------------------------------------------------------------
async function runCaseOnce(c: BenchmarkCase): Promise<CaseRunResult> {
  const started = Date.now();
  try {
    const model = resolveModel(modelId);
    const promptBody = `${c.company}\n\n${c.tender}`;
    const prompt = noThink ? `/no_think ${promptBody}` : promptBody;
    const result = await generateObject({
      model,
      schema: zodSchema(matchingScoreSchema),
      system: c.systemOverride ?? SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 4096,
      temperature: 0.2,
    });
    const ms = Date.now() - started;
    if (result.object == null) {
      return { ok: false, ms, error: "no object" };
    }
    return { ok: true, ms, output: result.object };
  } catch (err: unknown) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runCase(c: BenchmarkCase): Promise<CaseAggregate> {
  const runs: CaseRunResult[] = [];
  for (let i = 0; i < repeats; i++) {
    runs.push(await runCaseOnce(c));
  }

  const validOutputs = runs
    .filter((r): r is CaseRunResult & { output: AIMatchingScore } =>
      Boolean(r.ok && r.output),
    )
    .map((r) => r.output);

  const axisValues: Record<ScoreAxis, number[]> = {
    capability: validOutputs.map((o) => o.capabilityScore),
    experience: validOutputs.map((o) => o.experienceScore),
    location: validOutputs.map((o) => o.locationScore),
    certification: validOutputs.map((o) => o.certificationScore),
  };

  const m = {} as Record<ScoreAxis, number>;
  const sd = {} as Record<ScoreAxis, number>;
  for (const axis of AXES) {
    m[axis] = Number(mean(axisValues[axis]).toFixed(2));
    sd[axis] = Number(stdev(axisValues[axis]).toFixed(2));
  }

  const assertionDetails: CaseAggregate["assertionDetails"] = c.assertions.map(
    (a) => {
      let passed = 0;
      for (const out of validOutputs) if (evalAssertion(a, out)) passed++;
      return {
        description: describeAssertion(a),
        passed,
        total: validOutputs.length,
      };
    },
  );

  const assertionsPassed = assertionDetails.reduce(
    (s, a) => s + a.passed,
    0,
  );
  const assertionsTotal = assertionDetails.reduce((s, a) => s + a.total, 0);

  return {
    caseId: c.id,
    label: c.label,
    tags: c.tags,
    repeats,
    schemaValid: validOutputs.length,
    runs,
    mean: m,
    stdev: sd,
    assertionsPassed,
    assertionsTotal,
    assertionDetails,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const cases = loadCases();
  if (cases.length === 0) {
    console.error(
      "No cases loaded. Check benchmarks/matching/cases.json (and CASES filter).",
    );
    process.exit(1);
  }

  const startedAt = new Date();
  console.log(`Model:        ${modelId}`);
  console.log(`Cases:        ${cases.length}`);
  console.log(`Repeats:      ${repeats}`);
  console.log(`Total calls:  ${cases.length * repeats}`);
  console.log(`Prompt ver:   ${PROMPT_VERSION}${noThink ? " (+/no_think)" : ""}`);
  console.log(`Schema ver:   ${SCHEMA_VERSION}`);
  console.log(`Git:          ${gitSha()}\n`);

  const aggregates: CaseAggregate[] = [];
  let i = 0;
  for (const c of cases) {
    i++;
    process.stdout.write(`[${i}/${cases.length}] ${c.label} ... `);
    const agg = await runCase(c);
    aggregates.push(agg);
    const status = `valid=${agg.schemaValid}/${agg.repeats}  asserts=${agg.assertionsPassed}/${agg.assertionsTotal}`;
    const avgMs = Math.round(
      mean(agg.runs.filter((r) => r.ok).map((r) => r.ms)),
    );
    console.log(`${status}  ~${avgMs}ms`);
  }

  const allLatencies = aggregates
    .flatMap((a) => a.runs)
    .filter((r) => r.ok)
    .map((r) => r.ms);
  const totalCalls = aggregates.reduce((s, a) => s + a.runs.length, 0);
  const totalValid = aggregates.reduce((s, a) => s + a.schemaValid, 0);
  const totalAssertPassed = aggregates.reduce(
    (s, a) => s + a.assertionsPassed,
    0,
  );
  const totalAssertCount = aggregates.reduce(
    (s, a) => s + a.assertionsTotal,
    0,
  );

  const result: BenchmarkResultFile = {
    resultsVersion: RESULTS_VERSION,
    model: modelId,
    promptVersion: noThink ? `${PROMPT_VERSION}+nothink` : PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    git: gitSha(),
    createdAt: startedAt.toISOString(),
    repeats,
    cases: aggregates,
    summary: {
      totalCalls,
      schemaValidRate: totalValid / Math.max(1, totalCalls),
      assertionPassRate: totalAssertPassed / Math.max(1, totalAssertCount),
      avgLatencyMs: Math.round(mean(allLatencies)),
      p95LatencyMs: Math.round(percentile(allLatencies, 95)),
    },
  };

  const outDir = resolve(__dirname, "results");
  mkdirSync(outDir, { recursive: true });
  const ts = startedAt.toISOString().replace(/[:.]/g, "-");
  const slug = modelId.replace(/[\/:]/g, "_");
  const outPath = resolve(outDir, `${ts}__${slug}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log("\n────────────────────────────────────────");
  console.log(`Schema-valid rate:  ${(result.summary.schemaValidRate * 100).toFixed(1)}%  (${totalValid}/${totalCalls})`);
  console.log(`Assertion pass:     ${(result.summary.assertionPassRate * 100).toFixed(1)}%  (${totalAssertPassed}/${totalAssertCount})`);
  console.log(`Avg latency:        ${result.summary.avgLatencyMs}ms`);
  console.log(`p95 latency:        ${result.summary.p95LatencyMs}ms`);
  console.log(`\nResults written to: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
