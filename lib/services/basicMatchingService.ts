import { sql, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { tenderTaxonomies } from "@/lib/db/schema/app";
import { embedQuery } from "@/lib/services/embeddingService";
import { vectorToLiteral } from "@/lib/ai/embeddings";
import {
  fetchCompanyMatchContext,
  cpvOverlapScore,
  taxonomyOverlapScore,
  locationOverlapScore,
  type CompanyMatchContext,
} from "@/lib/services/basicMatchContext";
import {
  embedRerankEnabled,
  embedRerankScore,
} from "@/lib/services/basicMatchEmbedReranker";

/**
 * Basic (semantic) matching via pgvector + structural fusion rerank.
 */

export type Band = "high" | "medium" | "low";

export interface BasicMatchOptions {
  limit?: number;
  status?: string;
  minScore?: number;
  highThreshold?: number;
  mediumThreshold?: number;
  /** When company has EIC taxonomies, only return tenders sharing at least one. Default on. */
  requireSharedTaxonomy?: boolean;
  /** Fuse vector + CPV + taxonomy + location scores. Default on. */
  useStructuralRerank?: boolean;
  /** Re-score top hits with query↔tender embed similarity (same model as Basic Match). */
  useEmbedRerank?: boolean;
  /** @deprecated Use useEmbedRerank */
  useLlmRerank?: boolean;
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
  cpvScore?: number;
  taxonomyScore?: number;
  locationScore?: number;
  band: Band;
}

export interface BasicCompanyMatch {
  companyId: string;
  companyName: string;
  postcode: string | null;
  similarity: number;
  band: Band;
}

function structuralRerankEnabled(options: BasicMatchOptions): boolean {
  if (options.useStructuralRerank === false) return false;
  return process.env.BASIC_MATCH_STRUCTURAL !== "0";
}

function requireTaxonomyFilter(
  options: BasicMatchOptions,
  ctx: CompanyMatchContext,
): boolean {
  if (!ctx.hasTaxonomies) return false;
  if (options.requireSharedTaxonomy === false) return false;
  return process.env.BASIC_MATCH_REQUIRE_TAXONOMY !== "0";
}

function bandFor(sim: number, high = 0.72, medium = 0.55): Band {
  if (sim >= high) return "high";
  if (sim >= medium) return "medium";
  return "low";
}

const DOMAIN_MISMATCH_PENALTY = 0.08;

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
    const hasDomain = rule.companyNeedles.some((n) =>
      companyHaystack.includes(n),
    );
    if (!hasDomain) return DOMAIN_MISMATCH_PENALTY;
  }
  return 0;
}

function fusionScore(input: {
  vectorSimilarity: number;
  cpvScore: number;
  taxonomyScore: number;
  locationScore: number;
  capabilityMatch: boolean;
  domainPenalty: number;
}): number {
  let score =
    0.5 * input.vectorSimilarity +
    0.15 * input.cpvScore +
    0.15 * input.taxonomyScore +
    0.1 * input.locationScore;

  if (input.capabilityMatch) score += 0.08;
  score -= input.domainPenalty;

  return Math.max(0, Math.min(1, score));
}

async function loadTenderTaxonomyMap(
  tenderIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (tenderIds.length === 0) return map;

  const rows = await db
    .select({
      tenderId: tenderTaxonomies.tenderId,
      taxonomyId: tenderTaxonomies.taxonomyId,
    })
    .from(tenderTaxonomies)
    .where(inArray(tenderTaxonomies.tenderId, tenderIds));

  for (const row of rows) {
    const list = map.get(row.tenderId) ?? [];
    list.push(row.taxonomyId);
    map.set(row.tenderId, list);
  }
  return map;
}

function companyQueryText(ctx: CompanyMatchContext): string {
  return [
    ctx.capabilityLabels.join("; "),
    ctx.taxonomyNames.join("; "),
    ctx.locationText,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Find tenders semantically similar to a company.
 */
export async function basicMatchTendersForCompany(
  companyId: string,
  options: BasicMatchOptions = {},
): Promise<BasicTenderMatch[]> {
  const limit = options.limit ?? 20;
  const minScore = options.minScore ?? 0.62;
  const high = options.highThreshold ?? 0.78;
  const medium = options.mediumThreshold ?? 0.62;
  const candidateLimit = Math.min(limit * 5, 250);

  const ctx = await fetchCompanyMatchContext(companyId);
  const taxonomyFilter = requireTaxonomyFilter(options, ctx);

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
      ${
        taxonomyFilter
          ? sql`AND EXISTS (
              SELECT 1 FROM company_taxonomies ct
              INNER JOIN tender_taxonomies tt
                ON tt.taxonomy_id = ct.taxonomy_id AND tt.tender_id = t.id
              WHERE ct.company_id = ${companyId}
            )`
          : sql``
      }
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

  const rows = result.rows as Row[];
  const taxonomyMap = await loadTenderTaxonomyMap(rows.map((r) => r.id));
  const useFusion = structuralRerankEnabled(options);

  let matches: BasicTenderMatch[] = rows.map((r) => {
    const vectorSimilarity = 1 - Number(r.distance);
    const tenderText = [r.title, r.description, r.buyer].filter(Boolean).join(" ");
    const capabilityMatch = tenderMatchesCapability(
      tenderText,
      ctx.capabilityLabels,
    );
    const domainPenalty = domainMismatchPenalty(tenderText, ctx.capabilityLabels);

    const tenderTaxIds = taxonomyMap.get(r.id) ?? [];
    const cpvScore = cpvOverlapScore(ctx.cpvDivisions, r.cpv_codes);
    const taxonomyScore = taxonomyOverlapScore(ctx.taxonomyIds, tenderTaxIds);
    const locScore = locationOverlapScore(ctx.locationText, r.location);

    const similarity = useFusion
      ? fusionScore({
          vectorSimilarity,
          cpvScore,
          taxonomyScore,
          locationScore: locScore,
          capabilityMatch,
          domainPenalty: domainPenalty,
        })
      : Math.max(
          0,
          Math.min(
            1,
            vectorSimilarity +
              (capabilityMatch ? 0.07 : 0) -
              domainPenalty,
          ),
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
      cpvScore,
      taxonomyScore,
      locationScore: locScore,
      band: bandFor(similarity, high, medium),
    };
  });

  matches = matches
    .filter((m) => m.similarity >= minScore)
    .toSorted((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  const wantEmbedRerank =
    (options.useEmbedRerank === true ||
      options.useLlmRerank === true ||
      embedRerankEnabled()) &&
    matches.length > 1;

  if (wantEmbedRerank) {
    const queryText = companyQueryText(ctx);
    const rerankTop = Math.min(matches.length, 12);
    const head = matches.slice(0, rerankTop);
    const tail = matches.slice(rerankTop);

    const rescored = await Promise.all(
      head.map(async (m) => {
        const snippet = [m.title, m.buyer, m.location].filter(Boolean).join(" — ");
        try {
          const embedSim = await embedRerankScore(queryText, snippet);
          const blended = 0.6 * m.similarity + 0.4 * embedSim;
          return {
            ...m,
            similarity: blended,
            band: bandFor(blended, high, medium),
          };
        } catch {
          return m;
        }
      }),
    );

    matches = [...rescored, ...tail].toSorted(
      (a, b) => b.similarity - a.similarity,
    );
  }

  return matches;
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
 * Free-text semantic search across tenders.
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
