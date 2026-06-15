/**
 * Print a single comparison table across N result files.
 *
 * Usage:
 *   ./node_modules/.bin/tsx benchmarks/matching/summary.ts                # all results/*.json
 *   ./node_modules/.bin/tsx benchmarks/matching/summary.ts file1 file2 ...
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

import type { BenchmarkResultFile, ScoreAxis } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));

const AXES: ScoreAxis[] = [
  "capability",
  "experience",
  "location",
  "certification",
];

interface Loaded {
  file: string;
  data: BenchmarkResultFile;
}

function load(file: string): Loaded {
  const data = JSON.parse(readFileSync(file, "utf8")) as BenchmarkResultFile;
  return { file: basename(file), data };
}

function loadAllFromDir(): Loaded[] {
  const dir = resolve(__dirname, "results");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => resolve(dir, f))
    .sort()
    .map(load);
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function shortLabel(model: string): string {
  if (model.startsWith("ollama/")) return model.slice("ollama/".length);
  return model;
}

function padCenter(s: string, w: number): string {
  if (s.length >= w) return s;
  const total = w - s.length;
  const left = Math.floor(total / 2);
  const right = total - left;
  return " ".repeat(left) + s + " ".repeat(right);
}

function padRight(s: string, w: number): string {
  if (s.length >= w) return s;
  return s + " ".repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  if (s.length >= w) return s;
  return " ".repeat(w - s.length) + s;
}

function printHorizontalRule(widths: number[]) {
  console.log("+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+");
}

function printRow(
  cells: string[],
  widths: number[],
  align: ("l" | "r" | "c")[] = [],
) {
  const padded = cells.map((cell, i) => {
    const w = widths[i];
    const a = align[i] ?? "l";
    if (a === "c") return " " + padCenter(cell, w) + " ";
    if (a === "r") return " " + padLeft(cell, w) + " ";
    return " " + padRight(cell, w) + " ";
  });
  console.log("|" + padded.join("|") + "|");
}

function summaryTable(loaded: Loaded[]) {
  const headers = ["Model", "Schema", "Assert", "Avg ms", "p95 ms", "Repeats"];
  const rows: string[][] = loaded.map((l) => [
    shortLabel(l.data.model),
    pct(l.data.summary.schemaValidRate),
    pct(l.data.summary.assertionPassRate),
    String(l.data.summary.avgLatencyMs),
    String(l.data.summary.p95LatencyMs),
    String(l.data.repeats),
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const align: ("l" | "r")[] = ["l", "r", "r", "r", "r", "r"];

  console.log("\n## Summary\n");
  printHorizontalRule(widths);
  printRow(headers, widths, align);
  printHorizontalRule(widths);
  for (const r of rows) printRow(r, widths, align);
  printHorizontalRule(widths);
}

function perCaseTable(loaded: Loaded[]) {
  // Union of all case ids across files, preserving the order from the first.
  const seen = new Set<string>();
  const orderedCases: { id: string; label: string }[] = [];
  for (const l of loaded) {
    for (const c of l.data.cases) {
      if (!seen.has(c.caseId)) {
        seen.add(c.caseId);
        orderedCases.push({ id: c.caseId, label: c.label });
      }
    }
  }

  const headers = ["Case", ...loaded.map((l) => shortLabel(l.data.model))];

  const rows: string[][] = orderedCases.map(({ id, label }) => {
    const cells = [label];
    for (const l of loaded) {
      const c = l.data.cases.find((x) => x.caseId === id);
      if (!c) {
        cells.push("—");
        continue;
      }
      const ap = `${c.assertionsPassed}/${c.assertionsTotal}`;
      const sv = `${c.schemaValid}/${c.repeats}`;
      cells.push(`${ap}  (sv ${sv})`);
    }
    return cells;
  });

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const align: ("l" | "r")[] = ["l", ...loaded.map(() => "r" as const)];

  console.log("\n## Per-case assertion pass (with schema-valid)\n");
  printHorizontalRule(widths);
  printRow(headers, widths, align);
  printHorizontalRule(widths);
  for (const r of rows) printRow(r, widths, align);
  printHorizontalRule(widths);
}

function meanAxisTable(loaded: Loaded[]) {
  const seen = new Set<string>();
  const orderedCases: { id: string; label: string }[] = [];
  for (const l of loaded) {
    for (const c of l.data.cases) {
      if (!seen.has(c.caseId)) {
        seen.add(c.caseId);
        orderedCases.push({ id: c.caseId, label: c.label });
      }
    }
  }

  for (const axis of AXES) {
    const headers = ["Case", ...loaded.map((l) => shortLabel(l.data.model))];
    const rows: string[][] = orderedCases.map(({ id, label }) => {
      const cells = [label];
      for (const l of loaded) {
        const c = l.data.cases.find((x) => x.caseId === id);
        if (!c || c.schemaValid === 0) {
          cells.push("—");
          continue;
        }
        cells.push(c.mean[axis].toFixed(0));
      }
      return cells;
    });

    const widths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => r[i].length)),
    );
    const align: ("l" | "r")[] = ["l", ...loaded.map(() => "r" as const)];

    console.log(`\n## Mean ${axis} score per case\n`);
    printHorizontalRule(widths);
    printRow(headers, widths, align);
    printHorizontalRule(widths);
    for (const r of rows) printRow(r, widths, align);
    printHorizontalRule(widths);
  }
}

function failureReport(loaded: Loaded[]) {
  console.log(
    "\n## Behaviour patterns (mean cap score, lower-is-better for mismatches)\n",
  );

  const interesting = [
    { id: "it-vs-construction-mismatch", expect: "cap → 0" },
    { id: "marketing-vs-roads-mismatch", expect: "cap → 0" },
    { id: "law-firm-vs-it-mismatch", expect: "cap → 0" },
    { id: "roofing-vs-landscaping-partial", expect: "cap ≤ 25" },
    { id: "sparse-company-profile", expect: "cap ≤ 60" },
    { id: "large-tender-small-company", expect: "cap ≤ 60, exp ≤ 40" },
  ];

  const headers = [
    "Case (expected)",
    ...loaded.map((l) => shortLabel(l.data.model)),
  ];
  const rows: string[][] = interesting.map(({ id, expect }) => {
    const label = `${id}  (${expect})`;
    const cells = [label];
    for (const l of loaded) {
      const c = l.data.cases.find((x) => x.caseId === id);
      if (!c || c.schemaValid === 0) {
        cells.push("—");
        continue;
      }
      cells.push(
        `cap=${c.mean.capability.toFixed(0)} exp=${c.mean.experience.toFixed(0)}`,
      );
    }
    return cells;
  });

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const align: ("l" | "r")[] = ["l", ...loaded.map(() => "r" as const)];

  printHorizontalRule(widths);
  printRow(headers, widths, align);
  printHorizontalRule(widths);
  for (const r of rows) printRow(r, widths, align);
  printHorizontalRule(widths);
}

function main() {
  const args = process.argv.slice(2);
  const loaded =
    args.length > 0 ? args.map((f) => load(resolve(f))) : loadAllFromDir();

  if (loaded.length === 0) {
    console.error("No result files found.");
    process.exit(1);
  }

  console.log("# Matching benchmark summary");
  console.log(`Files: ${loaded.length}`);
  loaded.forEach((l) => {
    console.log(
      `  - ${l.file}  (git ${l.data.git}, prompt ${l.data.promptVersion})`,
    );
  });

  summaryTable(loaded);
  perCaseTable(loaded);
  failureReport(loaded);
  meanAxisTable(loaded);
}

main();
