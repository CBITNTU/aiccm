#!/usr/bin/env node
/**
 * Calls Find a Tender and TED APIs for the same 7-day window the weekly sync uses,
 * and prints how many tenders/notices each returns. Run from project root:
 *   node scripts/check-tender-counts.mjs
 * Loads .env.local so TED_API_KEY is used if set (reduces 429 from TED).
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const envPath = resolve(projectRoot, ".env.local");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']\s*$/g, "");
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !process.env[key]) {
      process.env[key] = value;
    }
  }
  if (process.env.TED_API_KEY) {
    process.env.TED_API_KEY = process.env.TED_API_KEY.trim();
  }
}

const FIND_TENDER_BASE = "https://www.find-tender.service.gov.uk/api/1.0";
const TED_API_BASE = "https://api.ted.europa.eu/v3";

const dateTo = new Date();
const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const dateFromISO = dateFrom.toISOString();
const dateToISO = dateTo.toISOString();

function formatTEDDate(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function countFindATender() {
  let total = 0;
  let cursor = undefined;
  let pages = 0;
  do {
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("stages", "tender");
    params.set(
      "updatedFrom",
      new Date(dateFromISO).toISOString().slice(0, 19),
    );
    params.set("updatedTo", new Date(dateToISO).toISOString().slice(0, 19));
    if (cursor) params.set("cursor", cursor);

    const url = `${FIND_TENDER_BASE}/ocdsReleasePackages?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "TenderMatchingService/1.0" },
    });
    if (!res.ok) {
      throw new Error(`Find a Tender API: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const releases = data.releases || [];
    total += releases.length;
    pages += 1;

    let nextUrl = data.links?.next;
    if (typeof nextUrl === "object" && nextUrl?.href) nextUrl = nextUrl.href;
    cursor = null;
    if (nextUrl) {
      try {
        const u = new URL(nextUrl);
        cursor = u.searchParams.get("cursor") ?? undefined;
      } catch {}
    }
    if (cursor) await new Promise((r) => setTimeout(r, 500));
  } while (cursor);

  return { total, pages };
}

async function tedRequest(body, nextToken) {
  const payload = {
    ...body,
    ...(nextToken && { iterationNextToken: nextToken }),
  };
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "TenderMatchingService/1.0",
  };
  if (process.env.TED_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.TED_API_KEY}`;
  }
  const res = await fetch(`${TED_API_BASE}/notices/search`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return res;
}

async function countTED() {
  const fromStr = formatTEDDate(dateFromISO);
  const toStr = formatTEDDate(dateToISO);
  const query = `publication-date >= ${fromStr} AND publication-date <= ${toStr}`;

  const body = {
    query,
    fields: ["notice-identifier", "publication-date"],
    limit: 100,
    scope: "ALL",
    checkQuerySyntax: false,
    paginationMode: "ITERATION",
    onlyLatestVersions: true,
  };

  const maxRetries = 5;
  let total = 0;
  let nextToken = undefined;
  let pages = 0;

  do {
    let res;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      res = await tedRequest(body, nextToken);
      if (res.status === 429 && attempt < maxRetries) {
        const retryAfter = res.headers.get("Retry-After");
        const waitSec = retryAfter
          ? Math.min(parseInt(retryAfter, 10) || 60, 120)
          : Math.min(Math.pow(2, attempt), 60);
        console.warn(`  [TED] 429 - waiting ${waitSec}s before retry ${attempt}/${maxRetries}...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }
      break;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TED API: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const notices = data.notices || [];
    total += notices.length;
    pages += 1;
    nextToken = data.iterationNextToken ?? undefined;
    if (nextToken) await new Promise((r) => setTimeout(r, 1000));
  } while (nextToken);

  return { total, pages };
}

async function main() {
  console.log("Date range (last 7 days):");
  console.log("  From:", dateFromISO);
  console.log("  To:  ", dateToISO);
  console.log("");

  console.log("Find a Tender (UK)...");
  let findResult;
  try {
    findResult = await countFindATender();
    console.log(`  Total releases: ${findResult.total} (${findResult.pages} page(s))`);
  } catch (err) {
    console.error("  Error:", err.message);
    findResult = { total: null, pages: 0 };
  }
  console.log("");

  console.log("TED (EU)...");
  if (process.env.TED_API_KEY) {
    console.log("  (Using TED_API_KEY from .env.local)");
  } else {
    console.log("  (No TED_API_KEY; anonymous requests often get 429)");
  }
  let tedResult;
  try {
    tedResult = await countTED();
    console.log(`  Total notices:  ${tedResult.total} (${tedResult.pages} page(s))`);
  } catch (err) {
    console.error("  Error:", err.message);
    tedResult = { total: null, pages: 0 };
  }
  console.log("");

  const fa = findResult.total ?? 0;
  const ted = tedResult.total ?? 0;
  console.log("Combined (raw sum, no cross-source dedupe):", fa + ted);
  console.log("(Your DB may have fewer if some reference_numbers match across sources.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
