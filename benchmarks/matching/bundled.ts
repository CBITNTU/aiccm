/**
 * Bundled "basic" matching benchmark.
 *
 * Strategy: instead of one LLM call per (company, tender) pair, send ONE call
 * with one company + N tenders and ask the model to classify each into
 * high / medium / low. This is what production "basic" pre-compute would do.
 *
 * Test design:
 *  - Re-use the 15 frozen cases. For each case's company, build a single
 *    bundle containing the case's "matching" tender + every other case's
 *    tender as distractors (15 tenders total per call).
 *  - Compare the band assigned to the "matching" tender against an expected
 *    band derived from the case's assertions.
 *  - Off-diagonal entries should mostly be `low` (random pairings).
 *
 * Metrics:
 *  - Schema-valid call rate
 *  - Matching-tender band agreement (precision on positives)
 *  - Off-diagonal noise (false-high rate on unrelated pairs)
 *  - Latency per call, throughput (pairs / second)
 *
 * Usage:
 *   MATCHING_MODEL=ollama/gemma3:4b npm run bench:matching:bundled
 *   MATCHING_MODEL=ollama/qwen3:4b NO_THINK=1 npm run bench:matching:bundled
 *   MATCHING_MODEL=ollama/qwen2.5:14b BUNDLE_SIZE=15 npm run bench:matching:bundled
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateObject, zodSchema } from "ai";
import { z } from "zod";

import { resolveModel } from "@/lib/ai/models";

import type { BenchmarkCase, CasesFile } from "./types";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROMPT_VERSION = "basic-bundled-v1";
const SCHEMA_VERSION = "basicBundleSchema@v1";

const modelId = process.env.MATCHING_MODEL?.trim() || "ollama/gemma3:4b";
const repeats = Math.max(1, Number(process.env.REPEATS) || 2);
const bundleSize = Math.max(2, Number(process.env.BUNDLE_SIZE) || 15);
const noThink = process.env.NO_THINK === "1" || process.env.NO_THINK === "true";

const SYSTEM = `You are a fast tender-fit classifier. For a single company and a numbered list of tenders, classify EACH tender as:

- "high":   clear industry match AND clear capability fit
- "medium": adjacent or overlapping but not a perfect fit
- "low":    industry mismatch OR no relevant capabilities

This is a coarse first-pass filter. Be quick and decisive. Do not deliberate.
Output one entry per tender, preserving the tenderId verbatim from the input.`;

const basicBundleSchema = z.object({
  results: z.array(
    z.object({
      tenderId: z.string(),
      band: z.enum(["high", "medium", "low"]),
      score: z.number().int().min(0).max(100),
    }),
  ),
});

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function loadCases(): BenchmarkCase[] {
  const file = resolve(__dirname, "cases.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as CasesFile;
  return parsed.cases;
}

/**
 * Derive an expected band from the case's assertions. We only care about the
 * "diagonal" case (matching company × matching tender).
 */
function expectedBandForDiagonal(c: BenchmarkCase): "high" | "medium" | "low" {
  // industryMismatch assertions imply the case is a hard "low"
  const isMismatch = c.assertions.some((a) => a.kind === "industryMismatch");
  if (isMismatch) return "low";

  // scoreRange on capability with max <= 25 → low
  const capAssertion = c.assertions.find(
    (a) => a.kind === "scoreRange" && a.axis === "capability",
  );
  if (capAssertion && capAssertion.kind === "scoreRange") {
    if (capAssertion.max != null && capAssertion.max <= 25) return "low";
    if (capAssertion.min != null && capAssertion.min >= 60) return "high";
    if (capAssertion.max != null && capAssertion.max <= 60) return "medium";
  }

  // Default to "high" for strong-fit cases (NHS, telecoms, healthcare etc.)
  return "high";
}

function renderTenderLine(c: BenchmarkCase, idx: number): string {
  const tenderId = `t${idx + 1}_${c.id.slice(0, 24)}`;
  return `--- tender ${tenderId} ---\n${c.tender.trim()}`;
}

interface BundleRun {
  caseId: string;
  expected: "high" | "medium" | "low";
  ok: boolean;
  ms: number;
  schemaValid: boolean;
  diagonalBand?: "high" | "medium" | "low";
  diagonalScore?: number;
  offDiagonalHighs?: number; // false positives among distractors
  offDiagonalTotal?: number;
  error?: string;
}

async function runOnce(
  anchor: BenchmarkCase,
  allCases: BenchmarkCase[],
): Promise<BundleRun> {
  // diagonal first, then distractors
  const distractors = allCases
    .filter((c) => c.id !== anchor.id)
    .slice(0, Math.max(0, bundleSize - 1));
  const bundle = [anchor, ...distractors];

  // stable tender ids
  const tenderIds = bundle.map((c, i) => `t${i + 1}_${c.id.slice(0, 24)}`);
  const diagonalTenderId = tenderIds[0];

  const tenderBlock = bundle
    .map((c, i) => `--- tender ${tenderIds[i]} ---\n${c.tender.trim()}`)
    .join("\n\n");

  const promptBody = `COMPANY:\n${anchor.company.trim()}\n\nTENDERS (${bundle.length}):\n\n${tenderBlock}`;
  const prompt = noThink ? `/no_think ${promptBody}` : promptBody;

  const started = Date.now();
  try {
    const model = resolveModel(modelId);
    const { object } = await generateObject({
      model,
      schema: zodSchema(basicBundleSchema),
      system: SYSTEM,
      prompt,
      maxOutputTokens: 4096,
      temperature: 0.1,
    });
    const ms = Date.now() - started;

    if (!object || !object.results) {
      return {
        caseId: anchor.id,
        expected: expectedBandForDiagonal(anchor),
        ok: false,
        ms,
        schemaValid: false,
        error: "no results array",
      };
    }

    const diagonal = object.results.find((r) => r.tenderId === diagonalTenderId);
    const offDiag = object.results.filter(
      (r) => r.tenderId !== diagonalTenderId,
    );
    const offDiagHighs = offDiag.filter((r) => r.band === "high").length;

    return {
      caseId: anchor.id,
      expected: expectedBandForDiagonal(anchor),
      ok: true,
      ms,
      schemaValid: true,
      diagonalBand: diagonal?.band,
      diagonalScore: diagonal?.score,
      offDiagonalHighs: offDiagHighs,
      offDiagonalTotal: offDiag.length,
    };
  } catch (err: unknown) {
    return {
      caseId: anchor.id,
      expected: expectedBandForDiagonal(anchor),
      ok: false,
      ms: Date.now() - started,
      schemaValid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const cases = loadCases();
  if (cases.length === 0) {
    console.error("No cases loaded.");
    process.exit(1);
  }

  console.log(`Model:        ${modelId}${noThink ? " (+/no_think)" : ""}`);
  console.log(`Anchors:      ${cases.length}`);
  console.log(`Bundle size:  ${bundleSize} (1 diagonal + ${bundleSize - 1} distractors)`);
  console.log(`Repeats:      ${repeats}`);
  console.log(`Total calls:  ${cases.length * repeats}`);
  console.log(`Total pairs:  ${cases.length * repeats * bundleSize}`);
  console.log(`Prompt ver:   ${PROMPT_VERSION}`);
  console.log(`Schema ver:   ${SCHEMA_VERSION}`);
  console.log(`Git:          ${gitSha()}\n`);

  const allRuns: BundleRun[] = [];
  let idx = 0;
  for (const anchor of cases) {
    idx++;
    for (let r = 0; r < repeats; r++) {
      process.stdout.write(
        `[${idx}/${cases.length} r${r + 1}] ${anchor.label.slice(0, 60)} ... `,
      );
      const result = await runOnce(anchor, cases);
      allRuns.push(result);
      const status = result.ok
        ? `${result.diagonalBand ?? "?"} (exp ${result.expected})  off-highs=${result.offDiagonalHighs}/${result.offDiagonalTotal}  ${result.ms}ms`
        : `FAIL ${result.error ?? "unknown"}  ${result.ms}ms`;
      console.log(status);
    }
  }

  // ---- Aggregate -----------------------------------------------------------
  const total = allRuns.length;
  const valid = allRuns.filter((r) => r.schemaValid).length;
  const validRuns = allRuns.filter((r) => r.schemaValid && r.diagonalBand);

  let diagAgree = 0;
  let diagHigh_expHigh = 0;
  let diagHigh_expLow = 0;
  let diagLow_expHigh = 0;
  for (const r of validRuns) {
    if (r.diagonalBand === r.expected) diagAgree++;
    if (r.diagonalBand === "high" && r.expected === "high") diagHigh_expHigh++;
    if (r.diagonalBand === "high" && r.expected === "low") diagHigh_expLow++;
    if (r.diagonalBand === "low" && r.expected === "high") diagLow_expHigh++;
  }

  const offHighs = validRuns.reduce(
    (s, r) => s + (r.offDiagonalHighs ?? 0),
    0,
  );
  const offTotals = validRuns.reduce(
    (s, r) => s + (r.offDiagonalTotal ?? 0),
    0,
  );

  const latencies = allRuns.filter((r) => r.ok).map((r) => r.ms);
  const avgLatency =
    latencies.length === 0
      ? 0
      : Math.round(
          latencies.reduce((s, x) => s + x, 0) / latencies.length,
        );
  const sortedLat = [...latencies].sort((a, b) => a - b);
  const p95 =
    sortedLat[Math.min(sortedLat.length - 1, Math.floor(0.95 * sortedLat.length))] ??
    0;
  const totalPairs = validRuns.reduce(
    (s, r) => s + 1 + (r.offDiagonalTotal ?? 0),
    0,
  );
  const totalTimeMs = latencies.reduce((s, x) => s + x, 0);
  const pairsPerSecond =
    totalTimeMs > 0 ? (totalPairs / (totalTimeMs / 1000)).toFixed(2) : "—";

  console.log("\n────────────────────────────────────────");
  console.log(`Schema-valid calls:   ${valid}/${total} (${((valid / total) * 100).toFixed(1)}%)`);
  console.log(`Diagonal band agree:  ${diagAgree}/${validRuns.length} (${validRuns.length > 0 ? ((diagAgree / validRuns.length) * 100).toFixed(1) : 0}%)`);
  console.log(`  exp=high → got high: ${diagHigh_expHigh}`);
  console.log(`  exp=low  → got high: ${diagHigh_expLow}  (false positive)`);
  console.log(`  exp=high → got low : ${diagLow_expHigh}  (false negative)`);
  console.log(`Off-diagonal highs:   ${offHighs}/${offTotals} (${offTotals > 0 ? ((offHighs / offTotals) * 100).toFixed(1) : 0}%) — should be low`);
  console.log(`Avg latency/call:     ${avgLatency}ms`);
  console.log(`p95 latency/call:     ${p95}ms`);
  console.log(`Throughput:           ${pairsPerSecond} pairs/sec`);
  if (Number(pairsPerSecond) > 0) {
    const for500 = Math.round(500 / Number(pairsPerSecond));
    console.log(`→ 500 pairs would take ~${for500}s (${(for500 / 60).toFixed(1)} min)`);
  }

  // ---- Persist -------------------------------------------------------------
  const outDir = resolve(__dirname, "results");
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = modelId.replace(/[\/:]/g, "_");
  const noThinkTag = noThink ? "_nothink" : "";
  const outPath = resolve(
    outDir,
    `${ts}__BUNDLED_b${bundleSize}__${slug}${noThinkTag}.json`,
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        model: modelId,
        noThink,
        bundleSize,
        repeats,
        promptVersion: PROMPT_VERSION,
        schemaVersion: SCHEMA_VERSION,
        git: gitSha(),
        createdAt: new Date().toISOString(),
        summary: {
          schemaValidRate: valid / Math.max(1, total),
          diagonalAgreeRate: diagAgree / Math.max(1, validRuns.length),
          offDiagonalHighRate: offHighs / Math.max(1, offTotals),
          avgLatencyMs: avgLatency,
          p95LatencyMs: p95,
          pairsPerSecond: Number(pairsPerSecond) || 0,
        },
        runs: allRuns,
      },
      null,
      2,
    ),
  );

  console.log(`\nResults written to: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
