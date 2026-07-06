import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  companies,
  companyTaxonomies,
  taxonomies,
  tenderTaxonomies,
} from "@/lib/db/schema/app";
import { getActiveProfile } from "@/lib/deployment";
import { getTaxonomyProvider } from "@/lib/taxonomy";
import {
  fetchCompanyCapabilityLabels,
  resolveCapabilityNamesByIds,
} from "@/lib/services/embeddingService";

export interface CompanyMatchContext {
  companyId: string;
  capabilityLabels: string[];
  taxonomyIds: string[];
  taxonomyNames: string[];
  locationText: string;
  /** Two-digit CPV division prefixes inferred from profile text (e.g. "45", "80"). */
  cpvDivisions: string[];
  hasTaxonomies: boolean;
}

function parseUuidList(value: unknown): string[] {
  if (!value || !Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v));
}

export async function fetchCompanyMatchContext(
  companyId: string,
): Promise<CompanyMatchContext> {
  const [row] = await db
    .select({
      description: companies.description,
      aiSummary: companies.aiSummary,
      postcode: companies.postcode,
      address: companies.address,
      keyCapabilities: companies.keyCapabilities,
      aiCapabilityTaxonomy: companies.aiCapabilityTaxonomy,
      operationLocations: companies.operationLocations,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const capabilityLabels = await fetchCompanyCapabilityLabels(companyId);
  const taxonomyIdsFromAi = parseUuidList(row?.aiCapabilityTaxonomy);
  const taxonomyLabelsFromAi = await resolveCapabilityNamesByIds(taxonomyIdsFromAi);

  const taxonomyRows = await db
    .select({
      id: taxonomies.id,
      name: taxonomies.name,
    })
    .from(companyTaxonomies)
    .innerJoin(taxonomies, eq(companyTaxonomies.taxonomyId, taxonomies.id))
    .where(eq(companyTaxonomies.companyId, companyId));

  const taxonomyIds = taxonomyRows.map((r) => r.id);
  const taxonomyNames = [
    ...new Set([
      ...taxonomyRows.map((r) => r.name),
      ...taxonomyLabelsFromAi,
    ]),
  ];

  const locationParts = [
    row?.postcode,
    row?.address,
    typeof row?.operationLocations === "string"
      ? row.operationLocations
      : Array.isArray(row?.operationLocations)
        ? (row.operationLocations as string[]).join(" ")
        : "",
  ].filter(Boolean);

  const profileText = [
    row?.aiSummary,
    row?.description,
    row?.keyCapabilities,
    capabilityLabels.join(" "),
    taxonomyNames.join(" "),
  ]
    .filter(Boolean)
    .join("\n");

  const cpvDivisions = getTaxonomyProvider().inferDivisionsFromText(profileText);

  return {
    companyId,
    capabilityLabels,
    taxonomyIds,
    taxonomyNames,
    locationText: locationParts.join(" "),
    cpvDivisions,
    hasTaxonomies: taxonomyIds.length > 0,
  };
}

export async function fetchTenderTaxonomyIds(
  tenderId: string,
): Promise<string[]> {
  const rows = await db
    .select({ taxonomyId: tenderTaxonomies.taxonomyId })
    .from(tenderTaxonomies)
    .where(eq(tenderTaxonomies.tenderId, tenderId));

  return rows.map((r) => r.taxonomyId);
}

export function taxonomyOverlapScore(
  companyTaxonomyIds: string[],
  tenderTaxonomyIds: string[],
): number {
  if (companyTaxonomyIds.length === 0 || tenderTaxonomyIds.length === 0) {
    return 0.5;
  }
  const tenderSet = new Set(tenderTaxonomyIds);
  const shared = companyTaxonomyIds.filter((id) => tenderSet.has(id)).length;
  if (shared === 0) return 0;
  return Math.min(1, shared / Math.min(companyTaxonomyIds.length, 3));
}

export function cpvOverlapScore(
  companyDivisions: string[],
  tenderCpvCodes: string[] | null,
): number {
  return getTaxonomyProvider().overlapScore(companyDivisions, tenderCpvCodes);
}

// Region-specific place/region names used to detect location overlap, sourced from
// the active deployment profile. Stub regions (CN/TH) start minimal; matching then
// degrades gracefully to the neutral/containment fallback below + embedding similarity.
function locationTermsRegex(): RegExp {
  const terms = getActiveProfile().locationTerms;
  if (terms.length === 0) return /(?!)/gi; // never matches → falls through to fallback
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
}

export function locationOverlapScore(
  companyLocationText: string,
  tenderLocation: string | null,
): number {
  if (!tenderLocation?.trim() || !companyLocationText.trim()) return 0.5;
  const companyHay = companyLocationText.toLowerCase();
  const tenderHay = tenderLocation.toLowerCase();

  const termsRegex = locationTermsRegex();
  const companyTerms = new Set(
    [...companyHay.matchAll(termsRegex)].map((m) => m[0].toLowerCase()),
  );
  const tenderTerms = new Set(
    [...tenderHay.matchAll(termsRegex)].map((m) => m[0].toLowerCase()),
  );

  if (companyTerms.size === 0 || tenderTerms.size === 0) {
    if (companyHay.includes(tenderHay) || tenderHay.includes(companyHay)) {
      return 0.85;
    }
    return 0.5;
  }

  for (const t of companyTerms) {
    if (tenderTerms.has(t)) return 1;
  }
  return 0.35;
}
