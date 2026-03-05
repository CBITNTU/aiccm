#!/usr/bin/env node

/**
 * Backfill latitude/longitude for companies that have a postcode or address
 * but no coordinates yet. Uses Google Maps Geocoding API.
 *
 * Usage:
 *   node scripts/backfill-company-coordinates.mjs
 *
 * Requires GOOGLE_MAPS_API_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local
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

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  console.error("GOOGLE_MAPS_API_KEY is not set in .env.local");
  process.exit(1);
}
if (!SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function geocode(query) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) return null;

  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng, displayName: data.results[0].formatted_address };
}

async function main() {
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, company_name, address, postcode")
    .is("latitude", null)
    .or("address.neq.,postcode.neq.");

  if (error) {
    console.error("Failed to fetch companies:", error.message);
    process.exit(1);
  }

  const toGeocode = companies.filter((c) => c.address?.trim() || c.postcode?.trim());
  console.log(`Found ${toGeocode.length} companies to geocode`);

  let success = 0;
  let failed = 0;

  for (const company of toGeocode) {
    const query = company.address?.trim() || company.postcode?.trim();
    if (!query) continue;

    const result = await geocode(query);
    if (result) {
      const { error: updateError } = await supabase
        .from("companies")
        .update({ latitude: result.lat, longitude: result.lng })
        .eq("id", company.id);

      if (updateError) {
        console.error(`  [FAIL] ${company.company_name}: ${updateError.message}`);
        failed++;
      } else {
        console.log(
          `  [OK] ${company.company_name} -> ${result.lat}, ${result.lng} (${result.displayName})`,
        );
        success++;
      }
    } else {
      console.warn(`  [SKIP] ${company.company_name}: could not geocode "${query}"`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} geocoded, ${failed} failed/skipped`);
}

main();
