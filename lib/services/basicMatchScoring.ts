import type { CompanyMatchContext } from "@/lib/services/basicMatchContext";

/**
 * Pure scoring/banding helpers for basic (semantic) matching.
 * No IO — extracted from basicMatchingService for direct unit testing.
 */

export type Band = "high" | "medium" | "low";

export function bandFor(sim: number, high = 0.72, medium = 0.55): Band {
  if (sim >= high) return "high";
  if (sim >= medium) return "medium";
  return "low";
}

export const DOMAIN_MISMATCH_PENALTY = 0.08;

export const DOMAIN_MISMATCH_RULES: Array<{
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

export function normaliseForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}

export function capabilityTokens(label: string): string[] {
  const norm = normaliseForMatch(label);
  if (norm.length <= 3) return [norm];
  return norm.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
}

export function tenderMatchesCapability(
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

export function domainMismatchPenalty(
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

export function fusionScore(input: {
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

export function companyQueryText(ctx: CompanyMatchContext): string {
  return [
    ctx.capabilityLabels.join("; "),
    ctx.taxonomyNames.join("; "),
    ctx.locationText,
  ]
    .filter(Boolean)
    .join("\n");
}
