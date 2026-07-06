#!/usr/bin/env tsx
/**
 * Real-world smoke test for the pluggable tender source adapters (lib/tenders/).
 *
 * Hits the LIVE upstream APIs (UK Find-a-Tender, EU TED), validates that every
 * returned tender matches the normalized `TenderData` contract, and confirms each
 * one maps cleanly to a DB insert row via `mapTenderToInsert` — WITHOUT writing to
 * the database (no `ingestTenders`, no rows, no queued jobs).
 *
 * There is no test framework in this repo; this self-reports ✓/✗ and exits non-zero
 * on any hard failure, matching the scripts/test-ollama-* convention.
 *
 * Usage:
 *   npm run test:tenders
 *   npx tsx scripts/test-tender-fetch.ts
 *
 * TED rate-limits hard without a key. Set TED_API_KEY in .env.local to exercise it
 * fully; otherwise a 429 is reported as SKIP (not a failure).
 */

import { config } from "dotenv";

config({ path: ".env.local" });

// Defer adapter/registry imports until AFTER dotenv has loaded, so that
// DEPLOYMENT_PROFILE / TED_API_KEY from .env.local are visible (the deployment
// module resolves the active profile once at import time).
async function loadDeps() {
  const [findMod, tedMod, stubMod, registryMod, mapMod] = await Promise.all([
    import("@/lib/tenders/adapters/findTender"),
    import("@/lib/tenders/adapters/ted"),
    import("@/lib/tenders/adapters/manualStub"),
    import("@/lib/tenders/registry"),
    import("@/lib/tenders/mapTenderToInsert"),
  ]);
  return {
    findTenderAdapter: findMod.findTenderAdapter,
    tedAdapter: tedMod.tedAdapter,
    cnManualAdapter: stubMod.cnManualAdapter,
    thManualAdapter: stubMod.thManualAdapter,
    getTenderAdapter: registryMod.getTenderAdapter,
    mapTenderToInsert: mapMod.mapTenderToInsert,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;
type TenderData = import("@/lib/tenders/types").TenderData;
type TenderSourceAdapter = import("@/lib/tenders/types").TenderSourceAdapter;

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string): boolean {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    const line = detail ? `${label} — ${detail}` : label;
    failures.push(line);
    console.log(`  \x1b[31m✗\x1b[0m ${line}`);
  }
  return condition;
}

function warn(msg: string): void {
  console.log(`  \x1b[33m⚠\x1b[0m ${msg}`);
}

function skip(msg: string): void {
  skipped++;
  console.log(`  \x1b[33m⊘ SKIP\x1b[0m ${msg}`);
}

function section(title: string): void {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isValidDate = (v: string): boolean => !isNaN(new Date(v).getTime());

const isHttpsUrl = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

const isBudget = (v: unknown): boolean =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0);

/**
 * Distinguish an ENVIRONMENT failure (no HTTP response reached us — DNS, TLS trust,
 * connection refused, timeout, rate limit) from a LOGIC failure (a bad HTTP response
 * or malformed data the adapter did return). Only the former should be a SKIP; a
 * real transform/shape defect must still fail the run.
 */
function isConnectivityError(err: Error & { status?: number; cause?: unknown }): boolean {
  if (err.status === 429) return true; // upstream rate limit
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  // undici surfaces network-level failures as `TypeError: fetch failed`.
  if (err.name === "TypeError" && /fetch failed/i.test(err.message)) return true;
  const code = (err.cause as { code?: string } | undefined)?.code;
  const NET_CODES = new Set([
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "CERT_HAS_EXPIRED",
    "ENOTFOUND",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
  ]);
  return code ? NET_CODES.has(code) : false;
}

/**
 * Validate a full page of tenders against the TenderData contract. Aggregates
 * per-rule violation counts so a 20-item page produces a handful of readable
 * checks rather than hundreds of lines.
 */
function validateBatch(
  label: string,
  tenders: TenderData[],
  opts: { expectedCurrency: string; expectedSource: string },
): void {
  const { expectedCurrency, expectedSource } = opts;
  const id = label;
  const n = tenders.length;
  const bad = {
    ref: 0,
    title: 0,
    buyer: 0,
    status: 0,
    pubDatePresent: 0,
    pubDateParse: 0,
    cpvArray: 0,
    budgetMin: 0,
    budgetMax: 0,
    deadline: 0,
    currency: 0,
    source: 0,
    specUrl: 0,
  };
  let unknownTitle = 0;
  let unknownBuyer = 0;

  for (const t of tenders) {
    if (!isNonEmptyString(t.reference_number)) bad.ref++;
    if (!isNonEmptyString(t.title)) bad.title++;
    if (!isNonEmptyString(t.buyer)) bad.buyer++;
    if (!isNonEmptyString(t.status)) bad.status++;
    if (!isNonEmptyString(t.publication_date)) bad.pubDatePresent++;
    else if (!isValidDate(t.publication_date)) bad.pubDateParse++;
    if (!Array.isArray(t.cpv_codes)) bad.cpvArray++;
    if (!isBudget(t.budget_min)) bad.budgetMin++;
    if (!isBudget(t.budget_max)) bad.budgetMax++;
    if (t.deadline !== null && !isValidDate(t.deadline)) bad.deadline++;
    if (t.currency !== expectedCurrency) bad.currency++;
    if (t.source !== expectedSource) bad.source++;
    const specUrl = (t.documents as Record<string, unknown> | undefined)
      ?.specification_url;
    if (!isHttpsUrl(specUrl)) bad.specUrl++;

    if (t.title === "Untitled Tender") unknownTitle++;
    if (t.buyer === "Unknown Buyer") unknownBuyer++;
  }

  check(`${id}: all ${n} have non-empty reference_number`, bad.ref === 0, `${bad.ref} missing`);
  check(`${id}: all ${n} have non-empty title`, bad.title === 0, `${bad.title} missing`);
  check(`${id}: all ${n} have non-empty buyer`, bad.buyer === 0, `${bad.buyer} missing`);
  check(`${id}: all ${n} have non-empty status`, bad.status === 0, `${bad.status} missing`);
  check(`${id}: all ${n} have a publication_date`, bad.pubDatePresent === 0, `${bad.pubDatePresent} missing`);
  check(`${id}: all publication_date values parse`, bad.pubDateParse === 0, `${bad.pubDateParse} invalid`);
  check(`${id}: cpv_codes is always an array`, bad.cpvArray === 0, `${bad.cpvArray} not arrays`);
  check(`${id}: budget_min is number|int>=0|null`, bad.budgetMin === 0, `${bad.budgetMin} invalid`);
  check(`${id}: budget_max is number|int>=0|null`, bad.budgetMax === 0, `${bad.budgetMax} invalid`);
  check(`${id}: deadline is null or a valid date`, bad.deadline === 0, `${bad.deadline} invalid`);
  check(`${id}: currency is "${expectedCurrency}"`, bad.currency === 0, `${bad.currency} mismatched`);
  check(`${id}: source is "${expectedSource}"`, bad.source === 0, `${bad.source} mismatched`);
  check(`${id}: documents.specification_url is https`, bad.specUrl === 0, `${bad.specUrl} invalid`);

  // Upstream can legitimately omit a title/buyer on the odd notice; a whole page of
  // fallbacks means the field mapping broke against the live schema. Warn on some,
  // fail only if the ENTIRE page is fallback values.
  if (unknownTitle > 0) warn(`${id}: ${unknownTitle}/${n} fell back to "Untitled Tender"`);
  if (unknownBuyer > 0) warn(`${id}: ${unknownBuyer}/${n} fell back to "Unknown Buyer"`);
  check(`${id}: not every title is the fallback`, unknownTitle < n, `all ${n} are "Untitled Tender"`);
  check(`${id}: not every buyer is the fallback`, unknownBuyer < n, `all ${n} are "Unknown Buyer"`);
}

/** Confirm every tender maps to a well-formed DB insert row (no DB write). */
function validateMapping(
  id: string,
  tenders: TenderData[],
  adapter: TenderSourceAdapter,
  mapTenderToInsert: Deps["mapTenderToInsert"],
): void {
  let badDeadline = 0;
  let badPubDate = 0;
  let badScalars = 0;
  let badCpv = 0;

  for (const t of tenders) {
    const row = mapTenderToInsert(t, {
      region: "uk",
      defaultCurrency: adapter.defaultCurrency,
      source: adapter.id,
    });
    if (!(row.deadline === null || row.deadline instanceof Date)) badDeadline++;
    if (!(row.publicationDate instanceof Date)) badPubDate++;
    if (
      !isNonEmptyString(row.currency) ||
      !isNonEmptyString(row.region) ||
      !isNonEmptyString(row.source)
    )
      badScalars++;
    if (!Array.isArray(row.cpvCodes)) badCpv++;
  }

  check(`${id}: mapped deadline is Date|null`, badDeadline === 0, `${badDeadline} invalid`);
  check(`${id}: mapped publicationDate is a Date`, badPubDate === 0, `${badPubDate} invalid`);
  check(`${id}: mapped currency/region/source set`, badScalars === 0, `${badScalars} missing`);
  check(`${id}: mapped cpvCodes is an array`, badCpv === 0, `${badCpv} invalid`);
}

function printSample(id: string, t: TenderData): void {
  const url = (t.documents as Record<string, unknown> | undefined)?.specification_url;
  console.log(`  sample [${id}]:`);
  console.log(`    title:    ${t.title}`);
  console.log(`    buyer:    ${t.buyer}`);
  console.log(`    cpv:      ${t.cpv_codes.length} code(s)${t.cpv_codes.length ? ` (${t.cpv_codes.slice(0, 3).join(", ")}${t.cpv_codes.length > 3 ? "…" : ""})` : ""}`);
  console.log(`    budget:   ${t.budget_min ?? "—"} … ${t.budget_max ?? "—"} ${t.currency ?? ""}`);
  console.log(`    location: ${t.location}`);
  console.log(`    deadline: ${t.deadline ?? "—"}`);
  console.log(`    url:      ${url ?? "—"}`);
}

// ---------------------------------------------------------------------------
// Adapter test drivers
// ---------------------------------------------------------------------------
const LIMIT = 20;

/** Run the full live test for one paginating adapter. `pageParam` builds the
 *  second-page fetch params from the first page's result. */
async function testLiveAdapter(
  adapter: TenderSourceAdapter,
  expectedCurrency: string,
  pageParam: (result: Awaited<ReturnType<TenderSourceAdapter["fetch"]>>) =>
    | Record<string, unknown>
    | null,
  mapTenderToInsert: Deps["mapTenderToInsert"],
): Promise<void> {
  const id = adapter.id;
  const result = await adapter.fetch({ isAdmin: true, limit: LIMIT });

  if (!check(`${id}: fetch returned a tenders array`, Array.isArray(result.tenders))) return;
  if (!check(`${id}: fetched at least one tender`, result.tenders.length > 0, "empty page")) return;

  validateBatch(id, result.tenders, { expectedCurrency, expectedSource: id });
  validateMapping(id, result.tenders, adapter, mapTenderToInsert);
  printSample(id, result.tenders[0]);

  // Pagination round-trip: prove the cursor/token actually advances the feed.
  const nextParams = pageParam(result);
  if (result.hasMore && nextParams) {
    console.log(`  … fetching page 2 to verify pagination`);
    const page2 = await adapter.fetch({ isAdmin: true, limit: LIMIT, ...nextParams });
    if (check(`${id}: page 2 returned a tenders array`, Array.isArray(page2.tenders))) {
      if (page2.tenders.length > 0) {
        validateBatch(`${id} p2`, page2.tenders, { expectedCurrency, expectedSource: id });
      } else {
        warn(`${id}: page 2 was empty (end of feed reached)`);
      }
    }
  } else {
    warn(`${id}: hasMore=false — single page only, pagination not exercised`);
  }
}

async function main(): Promise<void> {
  const deps = await loadDeps();
  const {
    findTenderAdapter,
    tedAdapter,
    cnManualAdapter,
    thManualAdapter,
    getTenderAdapter,
    mapTenderToInsert,
  } = deps;

  console.log("\x1b[1mTender source adapter smoke test\x1b[0m");
  console.log(`TED_API_KEY: ${process.env.TED_API_KEY ? "present" : "absent"}`);

  // ---- Registry wiring -----------------------------------------------------
  section("Registry wiring");
  check(`getTenderAdapter("find_tender") resolves`, getTenderAdapter("find_tender")?.id === "find_tender");
  check(`getTenderAdapter("ted") resolves`, getTenderAdapter("ted")?.id === "ted");
  check(`getTenderAdapter("cn_manual") resolves`, getTenderAdapter("cn_manual")?.id === "cn_manual");
  check(`getTenderAdapter("th_manual") resolves`, getTenderAdapter("th_manual")?.id === "th_manual");
  check(`getTenderAdapter(unknown) is undefined`, getTenderAdapter("does_not_exist") === undefined);

  // ---- Manual stubs --------------------------------------------------------
  section("Manual stubs (offline)");
  for (const stub of [cnManualAdapter, thManualAdapter]) {
    const r = await stub.fetch({});
    check(`${stub.id}: returns empty tenders`, Array.isArray(r.tenders) && r.tenders.length === 0);
    check(`${stub.id}: hasMore is false`, r.hasMore === false);
  }

  // ---- Find a Tender (UK) — live, no key ----------------------------------
  section("Find a Tender (UK) — live");
  try {
    await testLiveAdapter(
      findTenderAdapter,
      "GBP",
      (result) => (result.nextCursor ? { cursor: result.nextCursor } : null),
      mapTenderToInsert,
    );
  } catch (e) {
    const err = e as Error & { status?: number; cause?: unknown };
    if (isConnectivityError(err)) {
      const code = (err.cause as { code?: string } | undefined)?.code;
      skip(`find_tender unreachable (${code ?? err.name}): ${err.message} — environment/network, not an adapter defect`);
    } else {
      check(`find_tender: fetch did not throw`, false, err.message);
    }
  }

  // ---- TED (EU) — live, optional key --------------------------------------
  section("TED (EU) — live");
  try {
    await testLiveAdapter(
      tedAdapter,
      "EUR",
      (result) => (result.nextToken ? { iterationNextToken: result.nextToken } : null),
      mapTenderToInsert,
    );
  } catch (e) {
    const err = e as Error & { status?: number; cause?: unknown };
    if (isConnectivityError(err)) {
      const code = (err.cause as { code?: string } | undefined)?.code;
      skip(`TED unreachable (${code ?? err.name}): ${err.message} — set TED_API_KEY for higher quota`);
    } else {
      check(`ted: fetch did not throw`, false, err.message);
    }
  }

  // ---- Summary -------------------------------------------------------------
  section("Summary");
  console.log(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failures.length > 0) {
    console.log("\n\x1b[31mFailures:\x1b[0m");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("\x1b[31mUnexpected error:\x1b[0m", e);
  process.exit(1);
});
