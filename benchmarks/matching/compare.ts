/**
 * Compare two (or more) benchmark result files.
 *
 * Treats the FIRST file as the reference (baseline). Subsequent files are
 * compared against it. Always emits a deterministic, plain-text report.
 *
 * Usage:
 *   ./node_modules/.bin/tsx benchmarks/matching/compare.ts \
 *     benchmarks/matching/results/<reference>.json \
 *     benchmarks/matching/results/<candidate>.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  BenchmarkResultFile,
  CaseAggregate,
  ScoreAxis,
} from "./types";

const AXES: ScoreAxis[] = [
  "capability",
  "experience",
  "location",
  "certification",
];

function load(path: string): BenchmarkResultFile {
  return JSON.parse(readFileSync(resolve(path), "utf8")) as BenchmarkResultFile;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function meanAbsDelta(
  ref: CaseAggregate[],
  cand: CaseAggregate[],
  axis: ScoreAxis,
): number {
  const candById = new Map(cand.map((c) => [c.caseId, c]));
  const deltas: number[] = [];
  for (const r of ref) {
    const c = candById.get(r.caseId);
    if (!c) continue;
    if (r.schemaValid === 0 || c.schemaValid === 0) continue;
    deltas.push(Math.abs(r.mean[axis] - c.mean[axis]));
  }
  if (deltas.length === 0) return 0;
  return deltas.reduce((s, d) => s + d, 0) / deltas.length;
}

/** Spearman rank correlation across cases on a given axis. */
function rankCorrelation(
  ref: CaseAggregate[],
  cand: CaseAggregate[],
  axis: ScoreAxis,
): number {
  const candById = new Map(cand.map((c) => [c.caseId, c]));
  const pairs: { ref: number; cand: number; id: string }[] = [];
  for (const r of ref) {
    const c = candById.get(r.caseId);
    if (!c) continue;
    if (r.schemaValid === 0 || c.schemaValid === 0) continue;
    pairs.push({ id: r.caseId, ref: r.mean[axis], cand: c.mean[axis] });
  }
  if (pairs.length < 2) return 0;

  const rankOf = (values: number[]): number[] => {
    const indexed = values.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(values.length);
    // Average ties so identical values share a rank.
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
      i = j + 1;
    }
    return ranks;
  };

  const r1 = rankOf(pairs.map((p) => p.ref));
  const r2 = rankOf(pairs.map((p) => p.cand));
  const n = pairs.length;
  let sumDsq = 0;
  for (let k = 0; k < n; k++) {
    const d = r1[k] - r2[k];
    sumDsq += d * d;
  }
  return 1 - (6 * sumDsq) / (n * (n * n - 1));
}

function biggestDisagreements(
  ref: CaseAggregate[],
  cand: CaseAggregate[],
  topN = 3,
): { caseId: string; label: string; axis: ScoreAxis; ref: number; cand: number; delta: number }[] {
  const candById = new Map(cand.map((c) => [c.caseId, c]));
  const rows: ReturnType<typeof biggestDisagreements> = [];
  for (const r of ref) {
    const c = candById.get(r.caseId);
    if (!c) continue;
    if (r.schemaValid === 0 || c.schemaValid === 0) continue;
    for (const axis of AXES) {
      const delta = c.mean[axis] - r.mean[axis];
      rows.push({
        caseId: r.caseId,
        label: r.label,
        axis,
        ref: r.mean[axis],
        cand: c.mean[axis],
        delta,
      });
    }
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return rows.slice(0, topN);
}

function header(file: BenchmarkResultFile): string {
  return `${file.model}  (git=${file.git}, prompt=${file.promptVersion}, schema=${file.schemaVersion}, ${file.createdAt})`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: tsx benchmarks/matching/compare.ts <reference.json> <candidate.json> [<candidate2.json> ...]",
    );
    process.exit(1);
  }

  const ref = load(args[0]);
  const candidates = args.slice(1).map(load);

  console.log("Reference:");
  console.log(`  ${header(ref)}`);
  console.log(
    `  schemaValid=${pct(ref.summary.schemaValidRate)}  assertions=${pct(
      ref.summary.assertionPassRate,
    )}  avg=${ref.summary.avgLatencyMs}ms  p95=${ref.summary.p95LatencyMs}ms\n`,
  );

  for (const cand of candidates) {
    console.log("────────────────────────────────────────");
    console.log("Candidate:");
    console.log(`  ${header(cand)}`);
    console.log(
      `  schemaValid=${pct(cand.summary.schemaValidRate)}  assertions=${pct(
        cand.summary.assertionPassRate,
      )}  avg=${cand.summary.avgLatencyMs}ms  p95=${cand.summary.p95LatencyMs}ms`,
    );

    console.log("\nMean abs delta (candidate − reference), per axis:");
    for (const axis of AXES) {
      const mad = meanAbsDelta(ref.cases, cand.cases, axis);
      const rho = rankCorrelation(ref.cases, cand.cases, axis);
      console.log(
        `  ${axis.padEnd(13)}  mad=${mad.toFixed(1).padStart(5)}  spearman=${rho
          .toFixed(2)
          .padStart(5)}`,
      );
    }

    console.log("\nBiggest disagreements:");
    for (const row of biggestDisagreements(ref.cases, cand.cases, 5)) {
      const sign = row.delta >= 0 ? "+" : "";
      console.log(
        `  [${row.axis.padEnd(13)}] ${sign}${row.delta.toFixed(1).padStart(5)}  ref=${row.ref.toFixed(
          0,
        )} cand=${row.cand.toFixed(0)}   ${row.label}`,
      );
    }
    console.log();
  }
}

main();
