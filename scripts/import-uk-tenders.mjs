#!/usr/bin/env node
/**
 * Paginate /api/fetch-uk-tenders to bulk-import real UK tenders. Auth is via
 * the X-Tender-Sync-Secret header (read from .env.local).
 *
 *   node scripts/import-uk-tenders.mjs              # default 10 pages × 100
 *   PAGES=20 node scripts/import-uk-tenders.mjs
 *   PAGES=5 SEARCH="construction" node scripts/import-uk-tenders.mjs
 */

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";

// Re-load .env.local explicitly because dotenv/config only reads .env.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const BASE_URL = process.env.IMPORT_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.TENDER_SYNC_SECRET;
const PAGES = Number(process.env.PAGES ?? 10);
const LIMIT = Number(process.env.PAGE_LIMIT ?? 100);
const SEARCH = process.env.SEARCH ?? undefined;

if (!SECRET) {
  console.error("TENDER_SYNC_SECRET not set");
  process.exit(1);
}

// Stable date window for the entire pagination run. The upstream cursor only
// remains valid against the SAME date range, so we freeze it here.
const DAYS_BACK = Number(process.env.DAYS_BACK ?? 60);
const dateFrom = new Date();
dateFrom.setDate(dateFrom.getDate() - DAYS_BACK);
const filters = { dateFrom: dateFrom.toISOString() };

let cursor;
let totalImported = 0;
let totalDups = 0;

for (let page = 1; page <= PAGES; page++) {
  const body = {
    adminImport: true,
    limit: LIMIT,
    filters,
    ...(cursor ? { cursor } : {}),
    ...(SEARCH ? { searchTerm: SEARCH } : {}),
  };

  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/api/fetch-uk-tenders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tender-Sync-Secret": SECRET,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // The route surfaces upstream 429 as HTTP 500 with "Rate limited" in body.
    // Back off and retry rather than aborting the whole import.
    if (res.status === 429 || /Rate limited/.test(text)) {
      const backoffMs = 30_000;
      console.warn(
        `page ${page}: rate limited, backing off ${backoffMs / 1000}s…`,
      );
      await new Promise((r) => setTimeout(r, backoffMs));
      page--; // retry same page
      continue;
    }
    console.error(`page ${page}: HTTP ${res.status}`);
    console.error(text.slice(0, 400));
    break;
  }

  const data = await res.json();
  const imported = data.actuallyImported ?? 0;
  const dups = data.duplicatesSkipped ?? 0;
  totalImported += imported;
  totalDups += dups;
  const ms = Date.now() - t0;
  console.log(
    `page ${String(page).padStart(2)}: +${String(imported).padStart(3)} new, ${String(dups).padStart(3)} dup, hasMore=${data.hasMore}, ${ms}ms`,
  );

  if (!data.hasMore || !data.nextCursor) {
    console.log("no more pages");
    break;
  }
  cursor = data.nextCursor;

  // Be polite to the upstream API — small jitter keeps us below their limit.
  await new Promise((r) => setTimeout(r, 1500 + Math.random() * 500));
}

console.log(
  `\nDone. Total imported: ${totalImported}, total duplicates skipped: ${totalDups}`,
);
