import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  embedQuery,
  fetchCompanyCapabilityLabels,
} from "@/lib/services/embeddingService";
import { vectorToLiteral } from "@/lib/ai/embeddings";

/**
 * Basic (semantic) matching via pgvector cosine similarity.
 *
 * Design:
 * - One ANN query per company OR per tender. Sub-50ms on tens of thousands of
 *   rows with an HNSW index.
 * - Cosine distance (`<=>`) on normalised embeddings. Similarity is reported
 *   as `1 - distance` ∈ [0, 1]; the band threshold is configurable.
 * - Optional structural filters (status, CPV overlap, location) are applied
 *   BEFORE the vector op via a CTE-style prefilter when feasible.
 *
 * This is the "first-pass" matcher: it surfaces 50-200 candidates instantly.
 * The expensive LLM scoring still runs on demand for the few you actually
 * want to deep-analyse.
 */

export type Band = "high" | "medium" | "low";

export interface BasicMatchOptions {
  limit?: number;
  // Optional structural pre-filter
  status?: string; // e.g. "open"
  minScore?: number; // 0..1, drop anything below this similarity
  // Band thresholds; tuned to be intentionally generous for a coarse filter
  highThreshold?: number; // default 0.72
  mediumThreshold?: number; // default 0.55
}

export interface BasicTenderMatch {
  tenderId: string;
  title: string;
  buyer: string;
  cpvCodes: string[] | null;
  location: string | null;
  deadline: Date | null;
  status: string | null;
  similarity: number;
  vectorSimilarity?: number;
  capabilityMatch?: boolean;
  band: Band;
}

export interface BasicCompanyMatch {
  companyId: string;
  companyName: string;
  postcode: string | null;
  similarity: number;
  band: Band;
}

function bandFor(
  sim: number,
  high = 0.72,
  medium = 0.55,
): Band {
  if (sim >= high) return "high";
  if (sim >= medium) return "medium";
  return "low";
}

const CAPABILITY_BOOST = 0.07;
const DOMAIN_MISMATCH_PENALTY = 0.08;

/** Domains we penalise when absent from the company profile competencies. */
const DOMAIN_MISMATCH_RULES: Array<{
  tenderNeedle: string;
  companyNeedles: string[];
}> = [
  {
    tenderNeedle: "construction",
    companyNeedles: ["construction", "civil", "building", "demolition"],
  },
  {
    tenderNeedle: "demolition",
    companyNeedles: ["demolition", "construction", "civil"],
  },
  {
    tenderNeedle: "surveying",
    companyNeedles: ["survey", "geospatial", "mapping"],
  },
];

function normaliseForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

function capabilityTokens(label: string): string[] {
  const norm = normaliseForMatch(label);
  if (norm.length <= 3) return [norm];
  return norm.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
}

function tenderMatchesCapability(
  tenderText: string,
  capabilityLabels: string[],
): boolean {
  const haystack = normaliseForMatch(tenderText);
  for (const label of capabilityLabels) {
    const norm = normaliseForMatch(label);
    if (norm.length >= 4 && haystack.includes(norm)) continue;
    for (const token of capabilityTokens(label)) {
      if (haystack.includes(token)) return true;
    }
  }
  return false;
}

function domainMismatchPenalty(
  tenderText: string,
  capabilityLabels: string[],
): number {
  if (capabilityLabels.length === 0) return 0;
  const haystack = normaliseForMatch(tenderText);
  const companyHaystack = capabilityLabels.map(normaliseForMatch).join(" ");

  for (const rule of DOMAIN_MISMATCH_RULES) {
    if (!haystack.includes(rule.tenderNeedle)) continue;
    const hasDomain = rule.companyNeedles.some((n) => companyHaystack.includes(n));
    if (!hasDomain) return DOMAIN_MISMATCH_PENALTY;
  }
  return 0;
}

function hybridTenderScore(
  vectorSimilarity: number,
  tenderText: string,
  capabilityLabels: string[],
): { similarity: number; capabilityMatch: boolean } {
  const capabilityMatch = tenderMatchesCapability(tenderText, capabilityLabels);
  let similarity = vectorSimilarity;
  if (capabilityMatch) similarity += CAPABILITY_BOOST;
  similarity -= domainMismatchPenalty(tenderText, capabilityLabels);
  similarity = Math.max(0, Math.min(1, similarity));
  return { similarity, capabilityMatch };
}

/**
 * Find tenders semantically similar to a company.
 */
export async function basicMatchTendersForCompany(
  companyId: string,
  options: BasicMatchOptions = {},
): Promise<BasicTenderMatch[]> {
  const limit = options.limit ?? 50;
  const minScore = options.minScore ?? 0;
  const high = options.highThreshold ?? 0.78;
  const medium = options.mediumThreshold ?? 0.62;
  const candidateLimit = Math.min(limit * 4, 200);

  const capabilityLabels = await fetchCompanyCapabilityLabels(companyId);

  const result = await db.execute(sql`
    WITH q AS (
      SELECT embedding FROM companies WHERE id = ${companyId}
    )
    SELECT
      t.id,
      t.title,
      t.description,
      t.buyer,
      t.cpv_codes,
      t.location,
      t.deadline,
      t.status,
      (t.embedding <=> (SELECT embedding FROM q))::float AS distance
    FROM tenders t, q
    WHERE t.embedding IS NOT NULL
      AND (SELECT embedding FROM q) IS NOT NULL
      ${options.status ? sql`AND t.status = ${options.status}` : sql``}
    ORDER BY t.embedding <=> (SELECT embedding FROM q)
    LIMIT ${sql.raw(String(candidateLimit))}
  `);

  type Row = {
    id: string;
    title: string;
    description: string | null;
    buyer: string;
    cpv_codes: string[] | null;
    location: string | null;
    deadline: Date | null;
    status: string | null;
    distance: number;
  };

  return (result.rows as Row[])
    .map((r) => {
      const vectorSimilarity = 1 - Number(r.distance);
      const tenderText = [r.title, r.description, r.buyer].filter(Boolean).join(" ");
      const { similarity, capabilityMatch } = hybridTenderScore(
        vectorSimilarity,
        tenderText,
        capabilityLabels,
      );
      return {
        tenderId: r.id,
        title: r.title,
        buyer: r.buyer,
        cpvCodes: r.cpv_codes,
        location: r.location,
        deadline: r.deadline,
        status: r.status,
        similarity,
        vectorSimilarity,
        capabilityMatch,
        band: bandFor(similarity, high, medium),
      };
    })
    .filter((m) => m.similarity >= minScore)
    .toSorted((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Find companies semantically similar to a tender.
 */
export async function basicMatchCompaniesForTender(
  tenderId: string,
  options: BasicMatchOptions = {},
): Promise<BasicCompanyMatch[]> {
  const limit = options.limit ?? 50;
  const minScore = options.minScore ?? 0;
  const high = options.highThreshold ?? 0.72;
  const medium = options.mediumThreshold ?? 0.55;

  const result = await db.execute(sql`
    WITH q AS (
      SELECT embedding FROM tenders WHERE id = ${tenderId}
    )
    SELECT
      c.id,
      c.company_name,
      c.postcode,
      (c.embedding <=> (SELECT embedding FROM q))::float AS distance
    FROM companies c, q
    WHERE c.embedding IS NOT NULL
      AND (SELECT embedding FROM q) IS NOT NULL
    ORDER BY c.embedding <=> (SELECT embedding FROM q)
    LIMIT ${sql.raw(String(limit))}
  `);

  type Row = {
    id: string;
    company_name: string;
    postcode: string | null;
    distance: number;
  };

  return (result.rows as Row[])
    .map((r) => {
      const similarity = 1 - Number(r.distance);
      return {
        companyId: r.id,
        companyName: r.company_name,
        postcode: r.postcode,
        similarity,
        band: bandFor(similarity, high, medium),
      };
    })
    .filter((m) => m.similarity >= minScore);
}

/**
 * Free-text semantic search across tenders (useful for an admin "search bar").
 */
export async function basicMatchTendersForQuery(
  queryText: string,
  options: BasicMatchOptions = {},
): Promise<BasicTenderMatch[]> {
  const limit = options.limit ?? 50;
  const minScore = options.minScore ?? 0;
  const high = options.highThreshold ?? 0.72;
  const medium = options.mediumThreshold ?? 0.55;

  const queryVec = await embedQuery(queryText);
  const literal = vectorToLiteral(queryVec);

  const result = await db.execute(sql`
    SELECT
      t.id,
      t.title,
      t.buyer,
      t.cpv_codes,
      t.location,
      t.deadline,
      t.status,
      (t.embedding <=> ${literal}::vector)::float AS distance
    FROM tenders t
    WHERE t.embedding IS NOT NULL
      ${options.status ? sql`AND t.status = ${options.status}` : sql``}
    ORDER BY t.embedding <=> ${literal}::vector
    LIMIT ${sql.raw(String(limit))}
  `);

  type Row = {
    id: string;
    title: string;
    buyer: string;
    cpv_codes: string[] | null;
    location: string | null;
    deadline: Date | null;
    status: string | null;
    distance: number;
  };

  return (result.rows as Row[])
    .map((r) => {
      const similarity = 1 - Number(r.distance);
      return {
        tenderId: r.id,
        title: r.title,
        buyer: r.buyer,
        cpvCodes: r.cpv_codes,
        location: r.location,
        deadline: r.deadline,
        status: r.status,
        similarity,
        band: bandFor(similarity, high, medium),
      };
    })
    .filter((m) => m.similarity >= minScore);
}
