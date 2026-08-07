import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  companies,
  tenders,
  companyCapabilities,
  companyCapabilitiesRef,
  companyMarkets,
  companyStandards,
  companyTaxonomies,
  competencyTaxonomySeed,
  markets,
  standardsRef,
  tenderTaxonomies,
  taxonomies,
} from "@/lib/db/schema/app";
import { embedText, vectorToLiteral } from "@/lib/ai/embeddings";
import { getActiveProfile } from "@/lib/deployment";
import { resolveCurrencyConfig } from "@/lib/format/currency";
import { getTaxonomyProvider } from "@/lib/taxonomy";
import { localizedName } from "@/lib/taxonomy/localizedName";

function formatBudgetLine(
  budgetMin: number | null | undefined,
  budgetMax: number | null | undefined,
  currencyCode?: string | null,
): string {
  // Resolve the tender's own currency (e.g. EUR for TED notices in a UK deploy),
  // falling back to the active deployment currency for legacy/null rows.
  const cur = resolveCurrencyConfig(currencyCode, getActiveProfile().currency);
  const fmt = (n: number) => n.toLocaleString(cur.locale);
  const min = budgetMin != null && budgetMin > 0 ? budgetMin : null;
  const max = budgetMax != null && budgetMax > 0 ? budgetMax : null;
  if (min != null && max != null) {
    return `Contract value: ${cur.symbol}${fmt(min)} – ${cur.symbol}${fmt(max)}`;
  }
  if (max != null) {
    return `Contract value: up to ${cur.symbol}${fmt(max)}`;
  }
  if (min != null) {
    return `Contract value: from ${cur.symbol}${fmt(min)}`;
  }
  return "";
}

/**
 * Embedding source text construction.
 *
 * We deliberately concatenate the structured + AI-extracted fields rather than
 * embedding raw descriptions. This gives the vector a denser, more matchable
 * representation: capabilities, certifications, taxonomy, and location all
 * contribute to the geometry.
 */

function joinNonEmpty(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join("\n");
}

function jsonbToString(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function cpvNames(codes: string[] | null | undefined): string {
  if (!codes || codes.length === 0) return "";
  const taxonomy = getTaxonomyProvider();
  return codes
    .map((c) => `${c} ${taxonomy.getName(c)}`)
    .join("; ");
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuidList(value: unknown): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [];
  return raw
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => UUID_RE.test(v));
}

/** Resolve taxonomy UUIDs to human-readable labels for embedding text. */
export async function resolveCapabilityNamesByIds(
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];

  const [fromRef, fromSeed] = await Promise.all([
    db
      .select({ name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh) })
      .from(companyCapabilitiesRef)
      .where(inArray(companyCapabilitiesRef.id, unique)),
    db
      .select({ name: localizedName(competencyTaxonomySeed.name, competencyTaxonomySeed.nameZh) })
      .from(competencyTaxonomySeed)
      .where(inArray(competencyTaxonomySeed.id, unique)),
  ]);

  return [...fromRef, ...fromSeed].map((r) => r.name).filter(Boolean);
}

/** Labels from the company_capabilities junction (what the profile UI shows). */
export async function fetchCompanyCapabilityLabels(
  companyId: string,
): Promise<string[]> {
  const rows = await db
    .select({ name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh) })
    .from(companyCapabilities)
    .innerJoin(
      companyCapabilitiesRef,
      eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id),
    )
    .where(eq(companyCapabilities.companyId, companyId));

  return rows.map((r) => r.name);
}

export interface CompanyProfileLabels {
  marketLabels: string[];
  standardLabels: string[];
  taxonomyNames: string[];
}

/**
 * Markets, standards and taxonomy names attached to a company.
 *
 * These live in junction tables rather than on `companies`, so they are invisible
 * to a plain column read — but they are exactly the profile data users curate to
 * describe what they do, so they belong in the embedding source.
 */
export async function fetchCompanyProfileLabels(
  companyId: string,
): Promise<CompanyProfileLabels> {
  const [marketRows, standardRows, taxonomyRows] = await Promise.all([
    db
      .select({ name: localizedName(markets.name, markets.nameZh) })
      .from(companyMarkets)
      .innerJoin(markets, eq(companyMarkets.marketId, markets.id))
      .where(eq(companyMarkets.companyId, companyId)),
    db
      .select({ name: localizedName(standardsRef.name, standardsRef.nameZh) })
      .from(companyStandards)
      .innerJoin(standardsRef, eq(companyStandards.standardId, standardsRef.id))
      .where(eq(companyStandards.companyId, companyId)),
    db
      .select({ name: taxonomies.name })
      .from(companyTaxonomies)
      .innerJoin(taxonomies, eq(companyTaxonomies.taxonomyId, taxonomies.id))
      .where(eq(companyTaxonomies.companyId, companyId)),
  ]);

  return {
    marketLabels: marketRows.map((r) => r.name).filter(Boolean),
    standardLabels: standardRows.map((r) => r.name).filter(Boolean),
    taxonomyNames: taxonomyRows.map((r) => r.name).filter(Boolean),
  };
}

/** Taxonomy names linked on the tender (plus resolved AI taxonomy UUIDs). */
export async function fetchTenderCapabilityLabels(
  tenderId: string,
  aiCapabilityTaxonomy: unknown,
): Promise<string[]> {
  const junctionRows = await db
    .select({ name: taxonomies.name })
    .from(tenderTaxonomies)
    .innerJoin(taxonomies, eq(tenderTaxonomies.taxonomyId, taxonomies.id))
    .where(eq(tenderTaxonomies.tenderId, tenderId));

  const taxonomyIds = parseUuidList(aiCapabilityTaxonomy);
  const fromAi = await resolveCapabilityNamesByIds(taxonomyIds);

  return [...new Set([...junctionRows.map((r) => r.name), ...fromAi])];
}

// ============================================================================
// Company embeddings
// ============================================================================

export function buildCompanySource(company: {
  companyName: string;
  description: string | null;
  keyCapabilities: string | null;
  certifications: string | null;
  equipment: string | null;
  pastProjects: string | null;
  aiSummary: string | null;
  aiCompetencies: unknown;
  aiCapabilities: unknown;
  aiStrengths: unknown;
  aiCertifications: unknown;
  aiCapabilityTaxonomy: unknown;
  postcode: string | null;
  address: string | null;
  capabilityLabels?: string[];
  marketLabels?: string[];
  standardLabels?: string[];
  taxonomyNames?: string[];
}): string {
  // Curated profile signals go near the top: embedding models weight early
  // tokens more heavily, and these are the fields users actively maintain.
  const labelLine = (prefix: string, labels: string[] | undefined) =>
    labels && labels.length > 0 ? `${prefix}: ${labels.join("; ")}` : "";

  return joinNonEmpty([
    `Company: ${company.companyName}`,
    company.aiSummary ? `Summary: ${company.aiSummary}` : company.description,
    labelLine("Profile competencies", company.capabilityLabels),
    labelLine("Sector taxonomy", company.taxonomyNames),
    labelLine("Markets served", company.marketLabels),
    company.keyCapabilities ? `Capabilities: ${company.keyCapabilities}` : "",
    jsonbToString(company.aiCapabilities) ? `AI Capabilities: ${jsonbToString(company.aiCapabilities)}` : "",
    jsonbToString(company.aiCompetencies) ? `Competencies: ${jsonbToString(company.aiCompetencies)}` : "",
    jsonbToString(company.aiStrengths) ? `Strengths: ${jsonbToString(company.aiStrengths)}` : "",
    company.certifications ? `Certifications: ${company.certifications}` : "",
    jsonbToString(company.aiCertifications) ? `AI Certifications: ${jsonbToString(company.aiCertifications)}` : "",
    labelLine("Standards", company.standardLabels),
    company.equipment ? `Equipment: ${company.equipment}` : "",
    company.pastProjects ? `Past Projects: ${company.pastProjects}` : "",
    [company.address, company.postcode].filter(Boolean).join(", "),
  ]);
}

export async function embedCompany(
  companyId: string,
  options: { force?: boolean } = {},
): Promise<
  | { status: "embedded"; dim: number; sourceHash: string }
  | { status: "skipped"; reason: string }
> {
  const [row] = await db
    .select({
      id: companies.id,
      companyName: companies.companyName,
      description: companies.description,
      keyCapabilities: companies.keyCapabilities,
      certifications: companies.certifications,
      equipment: companies.equipment,
      pastProjects: companies.pastProjects,
      aiSummary: companies.aiSummary,
      aiCompetencies: companies.aiCompetencies,
      aiCapabilities: companies.aiCapabilities,
      aiStrengths: companies.aiStrengths,
      aiCertifications: companies.aiCertifications,
      aiCapabilityTaxonomy: companies.aiCapabilityTaxonomy,
      postcode: companies.postcode,
      address: companies.address,
      embeddingSourceHash: companies.embeddingSourceHash,
    })
    .from(companies)
    .where(sql`${companies.id} = ${companyId}`)
    .limit(1);

  if (!row) {
    return { status: "skipped", reason: "company not found" };
  }

  const taxonomyIds = parseUuidList(row.aiCapabilityTaxonomy);
  const [junctionLabels, taxonomyLabels, profileLabels] = await Promise.all([
    fetchCompanyCapabilityLabels(companyId),
    resolveCapabilityNamesByIds(taxonomyIds),
    fetchCompanyProfileLabels(companyId),
  ]);
  const capabilityLabels = [
    ...new Set([...junctionLabels, ...taxonomyLabels]),
  ];

  const source = buildCompanySource({
    ...row,
    capabilityLabels,
    ...profileLabels,
  });
  if (!source.trim()) {
    return { status: "skipped", reason: "no content to embed" };
  }

  const sourceHash = hash(source);
  if (!options.force && row.embeddingSourceHash === sourceHash) {
    return { status: "skipped", reason: "unchanged source" };
  }

  const { vector } = await embedText(source, "company");
  const literal = vectorToLiteral(vector);

  await db.execute(sql`
    UPDATE companies
    SET embedding = ${literal}::vector,
        embedding_generated_at = NOW(),
        embedding_source_hash = ${sourceHash}
    WHERE id = ${companyId}
  `);

  return { status: "embedded", dim: vector.length, sourceHash };
}

/**
 * Refresh a company's embedding after a profile mutation.
 *
 * Call this — not `embedCompany` — from request handlers and jobs. Two reasons:
 *
 *  1. It never throws. A provider outage (Ollama down, OpenAI 429) must never
 *     turn a successful save into a 500 for the user.
 *  2. It is safe to call unconditionally. `embedCompany` hashes the rebuilt
 *     source text and skips the provider round-trip when nothing that feeds the
 *     vector actually changed, so callers do not need to track dirty fields.
 *
 * Always call it *after* the surrounding transaction commits — it performs a
 * network round-trip and must not hold a DB transaction open.
 */
export async function refreshCompanyEmbedding(
  companyId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  try {
    await embedCompany(companyId, options);
  } catch (error) {
    console.error(
      "Company embedding refresh failed (non-fatal):",
      companyId,
      error,
    );
  }
}

// ============================================================================
// Tender embeddings
// ============================================================================

export function buildTenderSource(tender: {
  title: string;
  buyer: string;
  description: string | null;
  cpvCodes: string[] | null;
  location: string | null;
  deadline: Date | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency?: string | null;
  aiSummary: string | null;
  aiCapabilityTaxonomy: unknown;
  requirements: unknown;
  capabilityLabels?: string[];
}): string {
  const capabilityLine =
    tender.capabilityLabels && tender.capabilityLabels.length > 0
      ? `Sector tags: ${tender.capabilityLabels.join("; ")}`
      : "";

  const deadlineLine = tender.deadline
    ? `Deadline: ${tender.deadline.toISOString().slice(0, 10)}`
    : "";

  return joinNonEmpty([
    `Tender: ${tender.title}`,
    `Buyer: ${tender.buyer}`,
    tender.aiSummary ? `Summary: ${tender.aiSummary}` : tender.description,
    capabilityLine,
    cpvNames(tender.cpvCodes) ? `CPV: ${cpvNames(tender.cpvCodes)}` : "",
    formatBudgetLine(tender.budgetMin, tender.budgetMax, tender.currency),
    deadlineLine,
    jsonbToString(tender.requirements) ? `Requirements: ${jsonbToString(tender.requirements)}` : "",
    tender.location ? `Location: ${tender.location}` : "",
  ]);
}

export async function embedTender(
  tenderId: string,
  options: { force?: boolean } = {},
): Promise<
  | { status: "embedded"; dim: number; sourceHash: string }
  | { status: "skipped"; reason: string }
> {
  const [row] = await db
    .select({
      id: tenders.id,
      title: tenders.title,
      buyer: tenders.buyer,
      description: tenders.description,
      cpvCodes: tenders.cpvCodes,
      location: tenders.location,
      deadline: tenders.deadline,
      budgetMin: tenders.budgetMin,
      budgetMax: tenders.budgetMax,
      currency: tenders.currency,
      aiSummary: tenders.aiSummary,
      aiCapabilityTaxonomy: tenders.aiCapabilityTaxonomy,
      requirements: tenders.requirements,
      embeddingSourceHash: tenders.embeddingSourceHash,
    })
    .from(tenders)
    .where(sql`${tenders.id} = ${tenderId}`)
    .limit(1);

  if (!row) {
    return { status: "skipped", reason: "tender not found" };
  }

  const capabilityLabels = await fetchTenderCapabilityLabels(
    tenderId,
    row.aiCapabilityTaxonomy,
  );

  const source = buildTenderSource({ ...row, capabilityLabels });
  if (!source.trim()) {
    return { status: "skipped", reason: "no content to embed" };
  }

  const sourceHash = hash(source);
  if (!options.force && row.embeddingSourceHash === sourceHash) {
    return { status: "skipped", reason: "unchanged source" };
  }

  const { vector } = await embedText(source, "tender");
  const literal = vectorToLiteral(vector);

  await db.execute(sql`
    UPDATE tenders
    SET embedding = ${literal}::vector,
        embedding_generated_at = NOW(),
        embedding_source_hash = ${sourceHash}
    WHERE id = ${tenderId}
  `);

  return { status: "embedded", dim: vector.length, sourceHash };
}

// ============================================================================
// Embed an arbitrary query string (used at search time)
// ============================================================================

export async function embedQuery(text: string): Promise<number[]> {
  const { vector } = await embedText(text, "query");
  return vector;
}
