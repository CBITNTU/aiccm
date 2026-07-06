import { db } from "@/lib/db";
import { tenders } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";
import { aiGenerateText, aiGenerateObject } from "@/lib/ai";
import { getActiveProfile } from "@/lib/deployment";
import { resolveCurrencyConfig } from "@/lib/format/currency";
import { getCapabilityCatalog } from "@/lib/services/capabilityCatalog";
import {
  tenderCapabilitiesSchema,
  tenderSummaryAndTaxonomySchema,
} from "@/lib/schemas/capabilitySuggestion";

/**
 * Currency symbol for a tender's AI prompt budget string. Resolves the tender's own
 * currency (e.g. EUR for TED notices in a UK deploy), falling back to the active
 * deployment currency for legacy/null rows.
 */
function curSymbol(currencyCode?: string | null): string {
  return resolveCurrencyConfig(currencyCode, getActiveProfile().currency).symbol;
}

/**
 * Generate AI summary for a tender
 */
export async function generateTenderSummary(tenderId: string): Promise<string> {
  const result = await db
    .select({
      title: tenders.title,
      description: tenders.description,
      buyer: tenders.buyer,
      budgetMin: tenders.budgetMin,
      budgetMax: tenders.budgetMax,
      currency: tenders.currency,
      deadline: tenders.deadline,
      location: tenders.location,
      cpvCodes: tenders.cpvCodes,
      requirements: tenders.requirements,
    })
    .from(tenders)
    .where(eq(tenders.id, tenderId))
    .limit(1);

  const tender = result[0];

  if (!tender) {
    throw new Error("Failed to fetch tender: Tender not found");
  }

  const budgetRange =
    tender.budgetMin || tender.budgetMax
      ? `${curSymbol(tender.currency)}${tender.budgetMin ? tender.budgetMin.toLocaleString() : "?"} - ${curSymbol(tender.currency)}${tender.budgetMax ? tender.budgetMax.toLocaleString() : "?"}`
      : "Not specified";

  // Format requirements if available
  const requirementsText = tender.requirements
    ? typeof tender.requirements === "string"
      ? tender.requirements
      : JSON.stringify(tender.requirements)
    : "";

  const systemPrompt = `Generate a 200-word summary covering: requirements/scope, budget/timeline, ideal candidate, deadlines/contact, special requirements. Be specific and actionable.`;

  const userPrompt = `Tender Details:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${budgetRange}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpvCodes && tender.cpvCodes.length > 0 ? `CPV Codes: ${tender.cpvCodes.join(", ")}` : ""}
${requirementsText ? `Requirements: ${requirementsText}` : ""}

Summarize.`;

  const summary = await aiGenerateText({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 1000,
    estTokens: 2000,
  });

  // Store summary in database
  await db
    .update(tenders)
    .set({
      aiSummary: summary,
      summaryGeneratedAt: new Date(),
    })
    .where(eq(tenders.id, tenderId));

  return summary;
}

/**
 * Generate capability taxonomy for a tender.
 * Returns an array of capability IDs assigned from the existing catalog only —
 * never creates new capabilities.
 */
export async function generateTenderCapabilityTaxonomy(
  tenderId: string,
): Promise<string[]> {
  const result = await db
    .select({
      title: tenders.title,
      description: tenders.description,
      buyer: tenders.buyer,
      budgetMin: tenders.budgetMin,
      budgetMax: tenders.budgetMax,
      currency: tenders.currency,
      deadline: tenders.deadline,
      location: tenders.location,
      cpvCodes: tenders.cpvCodes,
      requirements: tenders.requirements,
    })
    .from(tenders)
    .where(eq(tenders.id, tenderId))
    .limit(1);

  const tender = result[0];

  if (!tender) {
    throw new Error("Failed to fetch tender: Tender not found");
  }

  const existingCapabilities = await getCapabilityCatalog();

  // Format capabilities for AI
  const capabilitiesByCategory: Record<
    string,
    Array<{ id: string; name: string }>
  > = {};
  existingCapabilities.forEach((cap) => {
    const category = cap.category || "Uncategorized";
    if (!capabilitiesByCategory[category]) {
      capabilitiesByCategory[category] = [];
    }
    capabilitiesByCategory[category].push({ id: cap.id, name: cap.name });
  });

  const capabilitiesList = Object.entries(capabilitiesByCategory)
    .map(
      ([category, caps]) =>
        `${category}:\n  ${caps.map((c) => `- ${c.name} (ID: ${c.id})`).join("\n  ")}`,
    )
    .join("\n\n");

  const systemPrompt = `Be selective - only capabilities clearly needed or highly relevant. ONLY return capability IDs from the provided list. Do NOT invent new capabilities.`;

  const userPrompt = `Tender Details:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${tender.budgetMin || tender.budgetMax ? `${curSymbol(tender.currency)}${tender.budgetMin?.toLocaleString() || "?"} - ${curSymbol(tender.currency)}${tender.budgetMax?.toLocaleString() || "?"}` : "Not specified"}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpvCodes && tender.cpvCodes.length > 0 ? `CPV Codes: ${tender.cpvCodes.join(", ")}` : ""}
${tender.requirements ? `Requirements: ${typeof tender.requirements === "string" ? tender.requirements : JSON.stringify(tender.requirements)}` : ""}

Available Capabilities:
${capabilitiesList}

Return existing (IDs from the list above).`;

  const parsed = await aiGenerateObject({
    schema: tenderCapabilitiesSchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 3000,
    estTokens: 3000,
  });

  // Assign from the existing catalog only — never create new capabilities.
  // Filter out any IDs the model returned that aren't in the catalog (hallucinated
  // UUIDs, names echoed back instead of IDs, etc.).
  const validIdSet = new Set(existingCapabilities.map((c) => c.id));
  const uniqueIds = Array.from(
    new Set((parsed.existing || []).filter((id) => validIdSet.has(id))),
  );

  // Store taxonomy in database
  await db
    .update(tenders)
    .set({
      aiCapabilityTaxonomy: uniqueIds,
      taxonomyGeneratedAt: new Date(),
    })
    .where(eq(tenders.id, tenderId));

  return uniqueIds;
}

/**
 * Generate tender summary and capability taxonomy in a single AI call (fewer API calls).
 */
export async function generateTenderSummaryAndTaxonomy(
  tenderId: string,
): Promise<{ summary: string; taxonomy: string[] }> {
  const result = await db
    .select({
      title: tenders.title,
      description: tenders.description,
      buyer: tenders.buyer,
      budgetMin: tenders.budgetMin,
      budgetMax: tenders.budgetMax,
      currency: tenders.currency,
      deadline: tenders.deadline,
      location: tenders.location,
      cpvCodes: tenders.cpvCodes,
      requirements: tenders.requirements,
    })
    .from(tenders)
    .where(eq(tenders.id, tenderId))
    .limit(1);

  const tender = result[0];

  if (!tender) {
    throw new Error("Failed to fetch tender: Tender not found");
  }

  const existingCapabilities = await getCapabilityCatalog();

  const capabilitiesByCategory: Record<
    string,
    Array<{ id: string; name: string }>
  > = {};
  existingCapabilities.forEach((cap) => {
    const category = cap.category || "Uncategorized";
    if (!capabilitiesByCategory[category])
      capabilitiesByCategory[category] = [];
    capabilitiesByCategory[category].push({ id: cap.id, name: cap.name });
  });
  const capabilitiesList = Object.entries(capabilitiesByCategory)
    .map(
      ([cat, caps]) =>
        `${cat}:\n  ${caps.map((c) => `- ${c.name} (ID: ${c.id})`).join("\n  ")}`,
    )
    .join("\n\n");

  const budgetRange =
    tender.budgetMin || tender.budgetMax
      ? `${curSymbol(tender.currency)}${tender.budgetMin ? tender.budgetMin.toLocaleString() : "?"} - ${curSymbol(tender.currency)}${tender.budgetMax ? tender.budgetMax.toLocaleString() : "?"}`
      : "Not specified";
  const requirementsText = tender.requirements
    ? typeof tender.requirements === "string"
      ? tender.requirements
      : JSON.stringify(tender.requirements)
    : "";

  const systemPrompt = `You are an expert at analyzing tenders. Provide:
1. "summary": A concise 200-word professional summary (key requirements, scope, budget, timeline, ideal candidate).
2. "existing": Array of capability IDs (strings) from the provided list that are relevant. ONLY use IDs from the list — do NOT invent new capabilities.`;

  const userPrompt = `Tender:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${budgetRange}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpvCodes?.length ? `CPV: ${tender.cpvCodes.join(", ")}` : ""}
${requirementsText ? `Requirements: ${requirementsText}` : ""}

Available capabilities:
${capabilitiesList}

Return one object with summary and existing (IDs from the list above).`;

  const parsed = await aiGenerateObject({
    schema: tenderSummaryAndTaxonomySchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 2500,
    estTokens: 3500,
  });

  const summary = parsed.summary;

  // Assign from the existing catalog only — never create new capabilities.
  // Filter out any IDs the model returned that aren't in the catalog.
  const validIdSet = new Set(existingCapabilities.map((c) => c.id));
  const uniqueIds = Array.from(
    new Set((parsed.existing || []).filter((id) => validIdSet.has(id))),
  );

  await db
    .update(tenders)
    .set({
      aiSummary: summary,
      summaryGeneratedAt: new Date(),
      aiCapabilityTaxonomy: uniqueIds,
      taxonomyGeneratedAt: new Date(),
    })
    .where(eq(tenders.id, tenderId));

  return { summary, taxonomy: uniqueIds };
}
