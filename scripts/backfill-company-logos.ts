#!/usr/bin/env tsx
/**
 * Discover and mirror a logo for every company that has a website but no logo
 * and has never been tried.
 *
 * The "never been tried" part is what `logo_discovery_attempted_at` buys us:
 * without it, every run re-crawls the same sites that have no usable logo.
 *
 * Usage:
 *   tsx scripts/backfill-company-logos.ts                # only never-tried companies
 *   FORCE=1 tsx scripts/backfill-company-logos.ts        # retry failures, re-discover
 *   LIMIT=25 tsx scripts/backfill-company-logos.ts       # cap (good for smoke tests)
 *   CONCURRENCY=5 tsx scripts/backfill-company-logos.ts  # default 3
 */

import { config } from "dotenv";

config({ path: ".env.local" });

// Defer module-level DB imports until AFTER dotenv has loaded. ESM hoists
// `import` statements, so a dynamic import keeps initialisation of the pg Pool
// in `lib/db/index.ts` correctly ordered.
async function loadDeps() {
  const [drizzle, dbMod, schemaMod, svcMod, storageMod] = await Promise.all([
    import("drizzle-orm"),
    import("@/lib/db"),
    import("@/lib/db/schema/app"),
    import("@/lib/services/companyLogoService"),
    import("@/lib/storage"),
  ]);
  return {
    sql: drizzle.sql,
    db: dbMod.db,
    closeDb: dbMod.closeDb,
    companies: schemaMod.companies,
    discoverCompanyLogo: svcMod.discoverCompanyLogo,
    getBlobStore: storageMod.getBlobStore,
  };
}

const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
const CONCURRENCY = process.env.CONCURRENCY ? Number(process.env.CONCURRENCY) : 3;

function pad(n: number, w = 4) {
  return String(n).padStart(w, " ");
}

async function main() {
  const deps = await loadDeps();
  const { db, sql, companies, discoverCompanyLogo, getBlobStore, closeDb } = deps;

  if (!getBlobStore().isConfigured) {
    console.error("BLOB_READ_WRITE_TOKEN is not set — nothing would be stored. Aborting.");
    process.exitCode = 1;
    return;
  }

  // System-generated companies (user_id IS NULL) are excluded even under FORCE,
  // matching backfill-embeddings.ts.
  const base = sql`${companies.userId} IS NOT NULL AND ${companies.websiteUrl} IS NOT NULL`;
  const rows = await db
    .select({ id: companies.id, name: companies.companyName })
    .from(companies)
    .where(
      FORCE
        ? base
        : sql`${base} AND ${companies.logoUrl} IS NULL AND ${companies.logoDiscoveryAttemptedAt} IS NULL`,
    )
    .limit(LIMIT ?? 10_000);

  if (rows.length === 0) {
    console.log("Nothing to do (every eligible company has been tried).");
    await closeDb();
    return;
  }

  console.log(
    `Discovering logos for ${rows.length} companies (concurrency ${CONCURRENCY}, force=${FORCE})...`,
  );

  let found = 0;
  let missed = 0;
  let failed = 0;
  const t0 = Date.now();

  // Small fixed pool: this fans out to third-party websites, so we pace it
  // rather than opening 500 sockets at once.
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const index = cursor++;
      const company = rows[index];
      const itemStart = Date.now();
      try {
        const result = await discoverCompanyLogo(company.id, { force: FORCE });
        const ms = Date.now() - itemStart;
        if (result.ok) {
          found++;
          console.log(`  ${pad(index + 1)}/${rows.length} ✓ ${ms}ms  ${company.name.slice(0, 60)}`);
        } else {
          missed++;
          console.log(
            `  ${pad(index + 1)}/${rows.length} ↷ ${(result.reason ?? "unknown").padEnd(20)} ${company.name.slice(0, 60)}`,
          );
        }
      } catch (error) {
        // discoverCompanyLogo is contractually never-throw, so reaching here
        // means something outside it broke. Keep going.
        failed++;
        console.error(
          `  ${pad(index + 1)}/${rows.length} ✗ ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(CONCURRENCY, rows.length)) }, worker),
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nLogos: ${found} found, ${missed} not found, ${failed} errored in ${elapsed}s`);

  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
