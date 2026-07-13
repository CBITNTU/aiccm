#!/usr/bin/env node
/**
 * Reseed the reference taxonomies (markets, standards, competencies) from the
 * regenerated bilingual seed SQL WITHOUT losing existing company selections.
 *
 * The seed files DELETE + re-INSERT every ref row with new deterministic IDs, which
 * would otherwise orphan (and cascade-delete) every row in company_markets /
 * company_standards / company_capabilities. This script:
 *
 *   1. Snapshots each selection as an English name-path (walking the OLD tree).
 *   2. Runs the three seed SQL files.
 *   3. Re-links each snapshot to the NEW row that has the same English name-path.
 *   4. Logs any path that no longer exists (the taxonomy was revised).
 *
 * Everything runs in one transaction — a failure rolls back to the pre-reseed state.
 *
 * Use this on the live UK DB. For a fresh CN deployment (no selections) the plain
 * `npm run db:seed-ref` is enough.
 *
 * Run:  node scripts/reseed-taxonomy-with-remap.mjs
 */
import { config } from "dotenv";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, "..", "drizzle", "seed");

// Build id -> English name-path for a self-referential (id, name, parent_id) tree.
// Path matches the key format used by generate-taxonomy-seeds.mjs, e.g.
// "market|Manufacturing|Aerospace" — so a NEW row with the same path is the match.
function buildPathMap(rows, prefix) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pathById = new Map();
  for (const r of rows) {
    const parts = [];
    let cur = r;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    pathById.set(r.id, `${prefix}|${parts.join("|")}`);
  }
  return pathById;
}

// Invert to path -> id (for looking up the NEW id of a snapshot path).
function invert(pathById) {
  const idByPath = new Map();
  for (const [id, path] of pathById) idByPath.set(path, id);
  return idByPath;
}

async function snapshotSelections(client) {
  // A single pg Client runs one query at a time — keep these sequential.
  const markets = await client.query("SELECT id, name, parent_id FROM public.markets");
  const standards = await client.query("SELECT id, name, parent_id FROM public.standards_ref");
  const caps = await client.query("SELECT id, name, parent_id FROM public.company_capabilities_ref");
  const marketPath = buildPathMap(markets.rows, "market");
  const standardPath = buildPathMap(standards.rows, "standard");
  const capPath = buildPathMap(caps.rows, "competency");

  const cm = await client.query("SELECT company_id, market_id FROM public.company_markets");
  const cs = await client.query("SELECT company_id, standard_id FROM public.company_standards");
  const cc = await client.query("SELECT company_id, capability_id FROM public.company_capabilities");

  const pick = (rows, idKey, pathMap) =>
    rows
      .map((r) => ({ companyId: r.company_id, path: pathMap.get(r[idKey]) }))
      .filter((r) => r.path);

  return {
    markets: pick(cm.rows, "market_id", marketPath),
    standards: pick(cs.rows, "standard_id", standardPath),
    capabilities: pick(cc.rows, "capability_id", capPath),
  };
}

async function runSeedFiles(client) {
  const files = ["010_seed_competency_taxonomy.sql", "020_seed_markets.sql", "030_seed_standards.sql"];
  for (const file of files) {
    const sql = readFileSync(join(SEED_DIR, file), "utf-8");
    console.log(`  Executing ${file}...`);
    await client.query(sql);
  }
}

async function relink(client, snapshot) {
  const markets = await client.query("SELECT id, name, parent_id FROM public.markets");
  const standards = await client.query("SELECT id, name, parent_id FROM public.standards_ref");
  const caps = await client.query("SELECT id, name, parent_id FROM public.company_capabilities_ref");
  const newMarket = invert(buildPathMap(markets.rows, "market"));
  const newStandard = invert(buildPathMap(standards.rows, "standard"));
  const newCap = invert(buildPathMap(caps.rows, "competency"));

  const stats = { markets: [0, 0], standards: [0, 0], capabilities: [0, 0] };
  const unmatched = [];

  async function restore(items, idByPath, table, idCol, statKey) {
    for (const { companyId, path } of items) {
      const newId = idByPath.get(path);
      if (!newId) {
        stats[statKey][1]++;
        unmatched.push(`${statKey}: ${path}`);
        continue;
      }
      await client.query(
        `INSERT INTO public.${table} (company_id, ${idCol}) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [companyId, newId],
      );
      stats[statKey][0]++;
    }
  }

  await restore(snapshot.markets, newMarket, "company_markets", "market_id", "markets");
  await restore(snapshot.standards, newStandard, "company_standards", "standard_id", "standards");
  await restore(snapshot.capabilities, newCap, "company_capabilities", "capability_id", "capabilities");

  return { stats, unmatched };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");

    console.log("Snapshotting existing company selections...");
    const snapshot = await snapshotSelections(client);
    console.log(
      `  markets: ${snapshot.markets.length}, standards: ${snapshot.standards.length}, capabilities: ${snapshot.capabilities.length}`,
    );

    console.log("Running regenerated seed files...");
    await runSeedFiles(client);

    console.log("Re-linking selections to new taxonomy IDs...");
    const { stats, unmatched } = await relink(client, snapshot);

    await client.query("COMMIT");

    console.log("\nReseed + remap complete:");
    for (const key of ["markets", "standards", "capabilities"]) {
      const [restored, dropped] = stats[key];
      console.log(`  ${key}: ${restored} re-linked, ${dropped} unmatched`);
    }
    if (unmatched.length) {
      console.log(`\nUnmatched selections (path no longer in taxonomy): ${unmatched.length}`);
      for (const u of unmatched.slice(0, 50)) console.log(`  - ${u}`);
      if (unmatched.length > 50) console.log(`  ... and ${unmatched.length - 50} more`);
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Reseed failed, rolled back:", error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
