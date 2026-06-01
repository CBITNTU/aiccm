#!/usr/bin/env node

/**
 * One-time smart backfill: latitude/longitude for all companies that have
 * a postcode or address but no coordinates yet. Uses Google Maps Geocoding API.
 * After running once, coordinates are only set when a company address changes
 * (PUT /api/companies/[id]) or a new company is created (create-or-join / onboarding).
 *
 * Usage:
 *   node scripts/backfill-company-coordinates.mjs
 *
 * Requires GOOGLE_MAPS_API_KEY and DATABASE_URL in .env.local
 */

import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!GOOGLE_MAPS_API_KEY) {
  console.error("GOOGLE_MAPS_API_KEY is not set in .env.local");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}

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
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const { rows: companies } = await client.query(`
      SELECT id, company_name, address, postcode
      FROM companies
      WHERE latitude IS NULL
        AND (
          NULLIF(TRIM(address), '') IS NOT NULL
          OR NULLIF(TRIM(postcode), '') IS NOT NULL
        )
    `);

    console.log(`Found ${companies.length} companies to geocode`);

    let success = 0;
    let failed = 0;

    for (const company of companies) {
      const query = company.address?.trim() || company.postcode?.trim();
      if (!query) continue;

      const result = await geocode(query);
      if (result) {
        try {
          await client.query(
            `UPDATE companies SET latitude = $1, longitude = $2 WHERE id = $3`,
            [result.lat, result.lng, company.id],
          );
          console.log(
            `  [OK] ${company.company_name} -> ${result.lat}, ${result.lng} (${result.displayName})`,
          );
          success++;
        } catch (updateError) {
          console.error(
            `  [FAIL] ${company.company_name}: ${updateError instanceof Error ? updateError.message : updateError}`,
          );
          failed++;
        }
      } else {
        console.warn(`  [SKIP] ${company.company_name}: could not geocode "${query}"`);
        failed++;
      }
    }

    console.log(`\nDone: ${success} geocoded, ${failed} failed/skipped`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
