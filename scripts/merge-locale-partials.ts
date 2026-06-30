#!/usr/bin/env tsx
/**
 * Merge partial locale JSON files (top-level namespace objects) into th.json.
 * Each partial file must contain one or more top-level keys from en.json.
 *
 * Usage: npx tsx scripts/merge-locale-partials.ts messages/th-partials/*.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type JsonObject = Record<string, unknown>;

function main() {
  const partialPaths = process.argv.slice(2);
  if (partialPaths.length === 0) {
    console.error("Usage: merge-locale-partials.ts <partial.json>...");
    process.exit(1);
  }

  const enPath = join(process.cwd(), "messages/en.json");
  const thPath = join(process.cwd(), "messages/th.json");

  const en = JSON.parse(readFileSync(enPath, "utf8")) as JsonObject;
  const th = { ...JSON.parse(readFileSync(thPath, "utf8")) } as JsonObject;

  for (const partialPath of partialPaths) {
    const partial = JSON.parse(readFileSync(partialPath, "utf8")) as JsonObject;
    for (const [key, value] of Object.entries(partial)) {
      if (!(key in en)) {
        console.warn(`Warning: ${partialPath} has unknown key "${key}"`);
      }
      th[key] = value;
    }
    console.log(`Merged ${Object.keys(partial).length} keys from ${partialPath}`);
  }

  writeFileSync(thPath, `${JSON.stringify(th, null, 2)}\n`, "utf8");
  console.log(`Wrote ${thPath}`);
}

main();
