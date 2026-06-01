#!/usr/bin/env tsx
/**
 * Backfill embeddings for every company and every tender that doesn't have one
 * (or whose source has changed).
 *
 * Usage:
 *   tsx scripts/backfill-embeddings.ts                # only missing/changed
 *   FORCE=1 tsx scripts/backfill-embeddings.ts        # re-embed everything
 *   ENTITY=companies tsx scripts/backfill-embeddings.ts
 *   ENTITY=tenders tsx scripts/backfill-embeddings.ts
 *   LIMIT=10 tsx scripts/backfill-embeddings.ts       # cap (good for smoke tests)
 */

import { config } from "dotenv";

config({ path: ".env.local" });

// Defer module-level DB imports until AFTER dotenv has loaded.
// ESM hoists `import` statements, so a dynamic import keeps initialisation
// of the pg Pool inside `lib/db/index.ts` ordered correctly.
async function loadDeps() {
  const [drizzle, dbMod, schemaMod, svcMod] = await Promise.all([
    import("drizzle-orm"),
    import("@/lib/db"),
    import("@/lib/db/schema/app"),
    import("@/lib/services/embeddingService"),
  ]);
  return {
    sql: drizzle.sql,
    db: dbMod.db,
    companies: schemaMod.companies,
    tenders: schemaMod.tenders,
    embedCompany: svcMod.embedCompany,
    embedTender: svcMod.embedTender,
  };
}

type Deps = Awaited<ReturnType<typeof loadDeps>>;

const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";
const ENTITY = process.env.ENTITY?.trim() || "both";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

function pad(n: number, w = 4) {
  return String(n).padStart(w, " ");
}

async function backfillCompanies(deps: Deps) {
  const { db, sql, companies, embedCompany } = deps;
  console.log("\n=== Companies ===");
  const rows = await db
    .select({ id: companies.id, name: companies.companyName })
    .from(companies)
    .where(FORCE ? sql`TRUE` : sql`${companies.embedding} IS NULL`)
    .limit(LIMIT ?? 10_000);

  if (rows.length === 0) {
    console.log("Nothing to do (all companies already embedded).");
    return;
  }
  console.log(`Embedding ${rows.length} companies...`);

  let ok = 0;
  let skip = 0;
  let err = 0;
  const t0 = Date.now();

  for (const [i, c] of rows.entries()) {
    const itemStart = Date.now();
    try {
      const r = await embedCompany(c.id, { force: FORCE });
      const ms = Date.now() - itemStart;
      if (r.status === "embedded") {
        ok++;
        console.log(
          `  ${pad(i + 1)}/${rows.length} ✓ ${ms}ms  ${c.name.slice(0, 60)}`,
        );
      } else {
        skip++;
        console.log(
          `  ${pad(i + 1)}/${rows.length} ↷ ${r.reason.padEnd(20)} ${c.name.slice(0, 60)}`,
        );
      }
    } catch (e) {
      err++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ${pad(i + 1)}/${rows.length} ✗ ${msg}`);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `Companies: ${ok} embedded, ${skip} skipped, ${err} failed in ${elapsed}s`,
  );
}

async function backfillTenders(deps: Deps) {
  const { db, sql, tenders, embedTender } = deps;
  console.log("\n=== Tenders ===");
  const rows = await db
    .select({ id: tenders.id, title: tenders.title })
    .from(tenders)
    .where(FORCE ? sql`TRUE` : sql`${tenders.embedding} IS NULL`)
    .limit(LIMIT ?? 10_000);

  if (rows.length === 0) {
    console.log("Nothing to do (all tenders already embedded).");
    return;
  }
  console.log(`Embedding ${rows.length} tenders...`);

  let ok = 0;
  let skip = 0;
  let err = 0;
  const t0 = Date.now();

  for (const [i, t] of rows.entries()) {
    const itemStart = Date.now();
    try {
      const r = await embedTender(t.id, { force: FORCE });
      const ms = Date.now() - itemStart;
      if (r.status === "embedded") {
        ok++;
        console.log(
          `  ${pad(i + 1)}/${rows.length} ✓ ${ms}ms  ${t.title.slice(0, 60)}`,
        );
      } else {
        skip++;
        console.log(
          `  ${pad(i + 1)}/${rows.length} ↷ ${r.reason.padEnd(20)} ${t.title.slice(0, 60)}`,
        );
      }
    } catch (e) {
      err++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ${pad(i + 1)}/${rows.length} ✗ ${msg}`);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `Tenders: ${ok} embedded, ${skip} skipped, ${err} failed in ${elapsed}s`,
  );
}

async function main() {
  console.log("Backfill embeddings");
  console.log(`  FORCE: ${FORCE}`);
  console.log(`  ENTITY: ${ENTITY}`);
  console.log(`  LIMIT:  ${LIMIT ?? "unlimited"}`);

  const deps = await loadDeps();

  if (ENTITY === "companies" || ENTITY === "both") {
    await backfillCompanies(deps);
  }
  if (ENTITY === "tenders" || ENTITY === "both") {
    await backfillTenders(deps);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
