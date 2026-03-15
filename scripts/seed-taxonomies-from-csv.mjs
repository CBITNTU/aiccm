#!/usr/bin/env node

/**
 * Seed markets, standards_ref, and company_capabilities_ref from the provided CSV files.
 * Run after migrations (including 20260216200000_add_parent_id_to_capabilities_ref).
 *
 * Usage:
 *   node scripts/seed-taxonomies-from-csv.mjs [competency.csv] [market.csv] [standards.csv]
 * If paths omitted, uses supabase/seed-data/Competency Taxonomy(in).csv etc.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. from .env.local).
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

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
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set in .env.local");
  process.exit(1);
}

function parseCsvLine(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      while (end < line.length) {
        const next = line.indexOf('"', end);
        if (next === -1) break;
        if (line[next + 1] === '"') {
          end = next + 2;
          continue;
        }
        end = next;
        break;
      }
      out.push(
        line
          .slice(i + 1, end)
          .replace(/""/g, '"')
          .trim(),
      );
      i = end + 1;
      if (line[i] === ",") i++;
      continue;
    }
    const comma = line.indexOf(",", i);
    const value =
      comma === -1 ? line.slice(i).trim() : line.slice(i, comma).trim();
    out.push(value);
    i = comma === -1 ? line.length : comma + 1;
  }
  return out;
}

function readCsv(filePath) {
  if (!existsSync(filePath)) {
    console.warn("File not found:", filePath);
    return [];
  }
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const [header, ...rows] = lines;
  const cols = parseCsvLine(header);
  return rows.map((row) => {
    const values = parseCsvLine(row);
    const obj = {};
    cols.forEach((c, i) => {
      obj[c] = values[i] ?? "";
    });
    return obj;
  });
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const seedDataDir = resolve(projectRoot, "supabase", "seed-data");
const args = process.argv.slice(2);
const competencyPath =
  args[0] ||
  resolve(seedDataDir, "Competency Taxonomy(in).csv");
const marketPath =
  args[1] ||
  resolve(seedDataDir, "Market list(Market list v2).csv");
const standardsPath =
  args[2] ||
  resolve(seedDataDir, "standard taxonomy(in).csv");

async function seedMarkets() {
  const rows = readCsv(marketPath);
  if (rows.length === 0) {
    console.log("No market rows; skipping markets.");
    return;
  }
  await supabase.from("company_markets").delete().neq("company_id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("markets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const l1Key = "Market_Level_1";
  const l2Key = "Market_Level_2";
  const l1Map = new Map(); // name -> id
  const l2Map = new Map(); // "parentId|name" -> id

  for (const row of rows) {
    const n1 = (row[l1Key] ?? "").trim();
    const n2 = (row[l2Key] ?? "").trim();
    if (!n1) continue;
    let pId = l1Map.get(n1);
    if (!pId) {
      const { data: ins } = await supabase
        .from("markets")
        .insert({ name: n1, parent_id: null, sort_order: 0 })
        .select("id")
        .single();
      if (ins) {
        pId = ins.id;
        l1Map.set(n1, pId);
      }
    }
    if (!n2) continue;
    const key = `${pId}|${n2}`;
    if (l2Map.has(key)) continue;
    const { data: ins2 } = await supabase
      .from("markets")
      .insert({ name: n2, parent_id: pId, sort_order: 0 })
      .select("id")
      .single();
    if (ins2) l2Map.set(key, ins2.id);
  }
  console.log("Markets: inserted", l1Map.size, "L1 and", l2Map.size, "L2.");
}

async function seedStandards() {
  const rows = readCsv(standardsPath);
  if (rows.length === 0) {
    console.log("No standards rows; skipping standards.");
    return;
  }
  await supabase.from("company_standards").delete().neq("company_id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("standards_ref").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const industryKey = "Industry";
  const standardKey = "Standard";
  const indMap = new Map();
  const stdMap = new Map();

  for (const row of rows) {
    const ind = (row[industryKey] ?? "").trim();
    const std = (row[standardKey] ?? "").trim();
    if (!ind) continue;
    let pId = indMap.get(ind);
    if (!pId) {
      const { data: ins } = await supabase
        .from("standards_ref")
        .insert({ name: ind, parent_id: null, sort_order: 0 })
        .select("id")
        .single();
      if (ins) {
        pId = ins.id;
        indMap.set(ind, pId);
      }
    }
    if (!std) continue;
    const key = `${pId}|${std}`;
    if (stdMap.has(key)) continue;
    const { data: ins2 } = await supabase
      .from("standards_ref")
      .insert({ name: std, parent_id: pId, sort_order: 0 })
      .select("id")
      .single();
    if (ins2) stdMap.set(key, ins2.id);
  }
  console.log(
    "Standards: inserted",
    indMap.size,
    "industries and",
    stdMap.size,
    "standards.",
  );
}

async function seedCompetency() {
  const rows = readCsv(competencyPath);
  if (rows.length === 0) {
    console.log("No competency rows; skipping competency.");
    return;
  }
  const l1Key = "Level 1 - Domain";
  const l2Key = "Level 2 - Capability Group";
  const l3Key = "Level 3 - Specific Competency";
  const l1Map = new Map();
  const l2Map = new Map();
  const l3Set = new Set(); // "l2Id|name" to avoid duplicate L3

  for (const row of rows) {
    const n1 = (row[l1Key] ?? "").trim();
    const n2 = (row[l2Key] ?? "").trim();
    const n3 = (row[l3Key] ?? "").trim();
    if (!n1) continue;
    let p1 = l1Map.get(n1);
    if (!p1) {
      const { data: ins } = await supabase
        .from("company_capabilities_ref")
        .insert({ name: n1, category: n1, parent_id: null, is_active: true })
        .select("id")
        .single();
      if (ins) {
        p1 = ins.id;
        l1Map.set(n1, p1);
      }
    }
    if (!n2) continue;
    const k2 = `${p1}|${n2}`;
    let p2 = l2Map.get(k2);
    if (!p2) {
      const { data: ins } = await supabase
        .from("company_capabilities_ref")
        .insert({ name: n2, category: n1, parent_id: p1, is_active: true })
        .select("id")
        .single();
      if (ins) {
        p2 = ins.id;
        l2Map.set(k2, p2);
      }
    }
    if (!n3) continue;
    const k3 = `${p2}|${n3}`;
    if (l3Set.has(k3)) continue;
    l3Set.add(k3);
    await supabase.from("company_capabilities_ref").insert({
      name: n3,
      category: n1,
      parent_id: p2,
      is_active: true,
    });
  }
  console.log(
    "Competency: inserted",
    l1Map.size,
    "L1,",
    l2Map.size,
    "L2,",
    l3Set.size,
    "L3.",
  );
}

async function main() {
  console.log("Seeding taxonomies from CSV...");
  await seedMarkets();
  await seedStandards();
  await seedCompetency();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
