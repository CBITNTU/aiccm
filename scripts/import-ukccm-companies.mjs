#!/usr/bin/env node

/**
 * Import verified UKCCM companies from the extracted JSON into Supabase.
 * Sets is_approved = true, is_system_company = true, status = 'active'.
 * Strips HTML from text fields. Uses existing lat/lng from the old system.
 *
 * Usage:
 *   node scripts/import-ukccm-companies.mjs [--dry-run]
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
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
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8226;/g, "•")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || null;
}

function buildDescription(company) {
  const parts = [];
  
  const profile = stripHtml(company.Profile);
  const products = stripHtml(company.ProductsAndServices);
  const ethos = stripHtml(company.Ethos);
  const basicLine = company.BasicLineOfBusiness?.trim();

  if (profile) parts.push(profile);
  else if (ethos) parts.push(ethos);
  
  if (basicLine && !parts[0]?.includes(basicLine)) {
    parts.unshift(basicLine);
  }

  if (products && !parts.some(p => p.includes(products))) {
    parts.push(`Products & Services: ${products}`);
  }

  return parts.join("\n\n") || null;
}

function buildCapabilities(company) {
  const caps = [];
  
  if (company.BasicLineOfBusiness?.trim()) {
    caps.push(company.BasicLineOfBusiness.trim());
  }
  
  const products = stripHtml(company.ProductsAndServices);
  if (products) {
    const lines = products.split("\n").map(l => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);
    for (const line of lines.slice(0, 10)) {
      if (!caps.includes(line) && line.length < 100) {
        caps.push(line);
      }
    }
  }

  return caps.length > 0 ? caps.join(", ") : null;
}

function buildAddress(company) {
  const parts = [company.AddressLine1, company.AddressLine2]
    .filter(Boolean)
    .map(s => s.replace(/\r\n/g, ", ").replace(/\n/g, ", ").trim());
  return parts.join(", ") || null;
}

async function main() {
  const jsonPath = resolve(__dirname, "ukccm_verified_companies.json");
  if (!existsSync(jsonPath)) {
    console.error("ukccm_verified_companies.json not found. Run the extraction first.");
    process.exit(1);
  }

  const companies = JSON.parse(readFileSync(jsonPath, "utf8"));
  console.log(`Loaded ${companies.length} companies from JSON`);

  if (DRY_RUN) {
    console.log("DRY RUN — no data will be written\n");
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const src of companies) {
    const companyName = src.Name?.trim();
    if (!companyName) {
      skipped++;
      continue;
    }

    // Check for duplicates by name + postcode
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("company_name", companyName)
      .eq("postcode", src.PostCode?.trim() || "")
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`  [SKIP] "${companyName}" — already exists`);
      skipped++;
      continue;
    }

    const lat = src.Latitude ? parseFloat(src.Latitude) : null;
    const lng = src.Longitude ? parseFloat(src.Longitude) : null;

    const record = {
      company_name: companyName,
      description: buildDescription(src),
      key_capabilities: buildCapabilities(src),
      address: buildAddress(src),
      postcode: src.PostCode?.trim() || null,
      latitude: lat && !isNaN(lat) ? lat : null,
      longitude: lng && !isNaN(lng) ? lng : null,
      contact_email: src.Email?.trim() || null,
      contact_phone: src.Phonenumber?.trim() || null,
      website_url: src.URL?.trim() || null,
      status: "active",
      is_system_company: true,
      is_approved: true,
    };

    if (DRY_RUN) {
      console.log(`  [INSERT] "${companyName}" (${record.postcode})`);
      inserted++;
      continue;
    }

    const { error } = await supabase.from("companies").insert(record);

    if (error) {
      console.error(`  [ERROR] "${companyName}": ${error.message}`);
      errors++;
    } else {
      console.log(`  [OK] "${companyName}"`);
      inserted++;
    }
  }

  console.log(
    `\nDone: ${inserted} inserted, ${skipped} skipped, ${errors} errors`,
  );
}

main();
