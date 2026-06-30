#!/usr/bin/env tsx
/**
 * Validates that a locale file matches en.json key structure and preserves
 * ICU/placeholder tokens from the source strings.
 *
 * Usage:
 *   npx tsx scripts/validate-locale.ts [locale]
 *   npx tsx scripts/validate-locale.ts th
 *   npx tsx scripts/validate-locale.ts --progress th
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

const MESSAGES_DIR = join(process.cwd(), "messages");

/** Extract simple `{name}` placeholders, ignoring ICU blocks like `{count, plural, ...}`. */
function extractPlaceholders(value: string): string[] {
  const placeholders = new Set<string>();
  let i = 0;

  while (i < value.length) {
    const start = value.indexOf("{", i);
    if (start === -1) break;

    let depth = 0;
    let end = -1;
    for (let j = start; j < value.length; j++) {
      if (value[j] === "{") depth++;
      if (value[j] === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }

    if (end === -1) break;

    const block = value.slice(start, end + 1);
    const inner = block.slice(1, -1).trim();

    if (!inner.includes(",")) {
      placeholders.add(block);
    } else {
      const name = inner.split(",")[0]?.trim();
      if (name) placeholders.add(`{${name}}`);
    }

    i = end + 1;
  }

  return [...placeholders].sort();
}

function isAsciiOnly(value: string): boolean {
  return /^[\x00-\x7F]*$/.test(value);
}

function collectLeaves(
  obj: JsonObject,
  prefix = "",
): Array<{ path: string; value: string }> {
  const leaves: Array<{ path: string; value: string }> = [];

  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      leaves.push(...collectLeaves(val as JsonObject, path));
    } else if (typeof val === "string") {
      leaves.push({ path, value: val });
    }
  }

  return leaves;
}

function collectKeyPaths(obj: JsonObject, prefix = ""): string[] {
  const paths: string[] = [];

  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      paths.push(...collectKeyPaths(val as JsonObject, path));
    } else {
      paths.push(path);
    }
  }

  return paths.sort();
}

function loadJson(file: string): JsonObject {
  return JSON.parse(readFileSync(file, "utf8")) as JsonObject;
}

function main() {
  const args = process.argv.slice(2);
  const showProgress = args.includes("--progress");
  const locale = args.find((a) => !a.startsWith("--")) ?? "th";

  const enPath = join(MESSAGES_DIR, "en.json");
  const localePath = join(MESSAGES_DIR, `${locale}.json`);

  const en = loadJson(enPath);
  const target = loadJson(localePath);

  const enPaths = collectKeyPaths(en);
  const targetPaths = collectKeyPaths(target);

  const enSet = new Set(enPaths);
  const targetSet = new Set(targetPaths);

  const missingInTarget = enPaths.filter((p) => !targetSet.has(p));
  const extraInTarget = targetPaths.filter((p) => !enSet.has(p));

  const enLeaves = new Map(collectLeaves(en).map((l) => [l.path, l.value]));
  const targetLeaves = new Map(
    collectLeaves(target).map((l) => [l.path, l.value]),
  );

  const placeholderMismatches: string[] = [];
  for (const [path, enValue] of enLeaves) {
    const targetValue = targetLeaves.get(path);
    if (targetValue === undefined) continue;

    const enTokens = extractPlaceholders(enValue);
    const targetTokens = extractPlaceholders(targetValue);

    const enTokenSet = new Set(enTokens);
    const missing = enTokens.filter((t) => !targetTokens.includes(t));
    const extra = targetTokens.filter((t) => !enTokenSet.has(t));

    if (missing.length > 0 || extra.length > 0) {
      placeholderMismatches.push(
        `${path}: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`,
      );
    }
  }

  const asciiOnlyLeaves = [...targetLeaves.entries()]
    .filter(([, value]) => isAsciiOnly(value) && value.trim().length > 0)
    .map(([path]) => path);

  let failed = false;

  if (missingInTarget.length > 0) {
    failed = true;
    console.error(`\nMissing keys in ${locale}.json (${missingInTarget.length}):`);
    for (const path of missingInTarget.slice(0, 20)) {
      console.error(`  - ${path}`);
    }
    if (missingInTarget.length > 20) {
      console.error(`  ... and ${missingInTarget.length - 20} more`);
    }
  }

  if (extraInTarget.length > 0) {
    failed = true;
    console.error(`\nExtra keys in ${locale}.json (${extraInTarget.length}):`);
    for (const path of extraInTarget.slice(0, 20)) {
      console.error(`  - ${path}`);
    }
    if (extraInTarget.length > 20) {
      console.error(`  ... and ${extraInTarget.length - 20} more`);
    }
  }

  if (placeholderMismatches.length > 0) {
    failed = true;
    console.error(
      `\nPlaceholder mismatches (${placeholderMismatches.length}):`,
    );
    for (const line of placeholderMismatches.slice(0, 20)) {
      console.error(`  - ${line}`);
    }
    if (placeholderMismatches.length > 20) {
      console.error(`  ... and ${placeholderMismatches.length - 20} more`);
    }
  }

  const total = enLeaves.size;
  const translated = total - asciiOnlyLeaves.length;
  const pct = total > 0 ? Math.round((translated / total) * 100) : 0;

  if (showProgress || !failed) {
    console.log(
      `\n${locale}.json progress: ${translated}/${total} non-ASCII (${pct}% translated)`,
    );
    if (showProgress && asciiOnlyLeaves.length > 0 && asciiOnlyLeaves.length <= 30) {
      console.log("\nRemaining ASCII-only keys:");
      for (const path of asciiOnlyLeaves) {
        console.log(`  - ${path}`);
      }
    } else if (showProgress && asciiOnlyLeaves.length > 30) {
      console.log(
        `\n${asciiOnlyLeaves.length} keys still ASCII-only (run with grep on output for full list)`,
      );
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`\nOK: ${locale}.json matches en.json structure and placeholders.`);
}

main();
