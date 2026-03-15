#!/usr/bin/env node
/**
 * Empty the processing queue (delete all jobs). Use after Reset or when stuck jobs block new work.
 * Loads .env.local for Supabase. Run from project root:
 *   node scripts/empty-queue.mjs
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { count } = await supabase
    .from("processing_queue")
    .select("*", { count: "exact", head: true });
  const total = count ?? 0;

  const { error } = await supabase
    .from("processing_queue")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.error("Failed to empty queue:", error.message);
    process.exit(1);
  }

  console.log("Queue emptied. Removed", total, "job(s).");
}

main();
