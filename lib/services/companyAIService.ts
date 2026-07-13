import { db } from "@/lib/db";
import {
  companies,
  companyCapabilities,
  companyCapabilitiesRef,
  markets,
  companyMarkets,
} from "@/lib/db/schema/app";
import { eq, asc, isNull } from "drizzle-orm";
import { aiGenerateText, aiGenerateObject } from "@/lib/ai";
import { companySummaryAndTaxonomySchema } from "@/lib/schemas/capabilitySuggestion";
import { getCapabilityCatalog } from "@/lib/services/capabilityCatalog";
import { localizedName, localizedCategory } from "@/lib/taxonomy/localizedName";

// ---------------------------------------------------------------------------
// Local taxonomy helpers (keyword scoring, no AI)
// ---------------------------------------------------------------------------

const LOCAL_TAXONOMY_MIN_SCORE = 1;
const LOCAL_TAXONOMY_MAX_L1 = 5;

function toSearchWords(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function scoreCapabilityMatch(
  companyWords: string[],
  companyTextLower: string,
  capabilityName: string,
  category: string | null,
): number {
  const nameWords = toSearchWords(capabilityName);
  const categoryWords = category ? toSearchWords(category) : [];
  const allTerms = [...new Set([...nameWords, ...categoryWords])];
  if (allTerms.length === 0) return 0;
  let score = 0;
  for (const word of allTerms) {
    if (companyWords.includes(word)) score += 1;
  }
  if (capabilityName && companyTextLower.includes(capabilityName.toLowerCase())) score += 2;
  if (category && companyTextLower.includes(category.toLowerCase())) score += 2;
  return score;
}

async function assignCapabilitiesLocally(companyId: string): Promise<string[]> {
  const companyResult = await db
    .select({
      companyName: companies.companyName,
      description: companies.description,
      keyCapabilities: companies.keyCapabilities,
      certifications: companies.certifications,
      equipment: companies.equipment,
      pastProjects: companies.pastProjects,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const company = companyResult[0];
  if (!company) throw new Error(`Failed to fetch company: Company not found`);

  const parts = [
    company.companyName,
    company.description,
    company.keyCapabilities,
    company.certifications,
    company.equipment,
    company.pastProjects,
  ].filter(Boolean) as string[];

  const companyText = parts.join(" ");
  const companyTextLower = companyText.toLowerCase();
  const companyWords = toSearchWords(companyText);
  if (companyWords.length === 0) return [];

  // Only L1 capabilities (parent_id IS NULL)
  const l1Caps = await db
    .select({ id: companyCapabilitiesRef.id, name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh), category: localizedCategory(companyCapabilitiesRef.category, companyCapabilitiesRef.categoryZh) })
    .from(companyCapabilitiesRef)
    .where(isNull(companyCapabilitiesRef.parentId))
    .orderBy(asc(companyCapabilitiesRef.name));

  if (l1Caps.length === 0) return [];

  const scored = l1Caps.map((cap) => ({
    id: cap.id,
    score: scoreCapabilityMatch(companyWords, companyTextLower, cap.name, cap.category),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score >= LOCAL_TAXONOMY_MIN_SCORE)
    .slice(0, LOCAL_TAXONOMY_MAX_L1)
    .map((s) => s.id);
}

/**
 * Generate AI summary for a company
 */
export async function generateCompanySummary(
  companyId: string,
): Promise<string> {
  // Fetch company data
  const result = await db
    .select({
      companyName: companies.companyName,
      description: companies.description,
      keyCapabilities: companies.keyCapabilities,
      certifications: companies.certifications,
      equipment: companies.equipment,
      pastProjects: companies.pastProjects,
      websiteUrl: companies.websiteUrl,
      postcode: companies.postcode,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const company = result[0];

  if (!company) {
    throw new Error("Failed to fetch company: Company not found");
  }

  console.log("[CompanyAI:summary] Company data fetched —", {
    companyName: company.companyName,
    hasDescription: !!company.description,
    hasKeyCapabilities: !!company.keyCapabilities,
    hasCertifications: !!company.certifications,
    hasEquipment: !!company.equipment,
    hasPastProjects: !!company.pastProjects,
    hasWebsiteUrl: !!company.websiteUrl,
    hasPostcode: !!company.postcode,
  });

  // Fetch company capabilities from junction table
  const capabilityRows = await db
    .select({ name: localizedName(companyCapabilitiesRef.name, companyCapabilitiesRef.nameZh) })
    .from(companyCapabilities)
    .innerJoin(
      companyCapabilitiesRef,
      eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id),
    )
    .where(eq(companyCapabilities.companyId, companyId));

  const capabilitiesList =
    capabilityRows
      .map((cc) => cc.name)
      .filter(Boolean)
      .join(", ") || "";

  console.log("[CompanyAI:summary] Capabilities from junction table — count:", capabilityRows.length, "list:", capabilitiesList.substring(0, 200));

  const systemPrompt = `Generate a 200-word professional summary: competencies, achievements, certifications, market position, differentiators. Be specific.`;

  const userPrompt = `Company Details:
Name: ${company.companyName || "N/A"}
Description: ${company.description || "N/A"}
${capabilitiesList ? `Capabilities: ${capabilitiesList}` : ""}
${company.keyCapabilities ? `Key Capabilities: ${company.keyCapabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.pastProjects ? `Past Projects: ${company.pastProjects}` : ""}
${company.websiteUrl ? `Website: ${company.websiteUrl}` : ""}
${company.postcode ? `Location: ${company.postcode}` : ""}

Summarize.`;

  console.log("[CompanyAI:summary] Prompt —", userPrompt);

  const summary = await aiGenerateText({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 1000,
    estTokens: 2000,
  });

  console.log("[CompanyAI:summary] Result — length:", summary.length, "preview:", summary.substring(0, 200));

  // Store summary in database
  await db
    .update(companies)
    .set({
      aiSummary: summary,
      summaryGeneratedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  console.log("[CompanyAI:summary] DB save confirmed for company", companyId);

  return summary;
}

/**
 * Assign capabilities to a company using local keyword scoring (no AI).
 * Picks the top 2-5 L1 capabilities whose name/category words best match the company text.
 */
export async function generateCompanyCapabilityTaxonomy(
  companyId: string,
  _fullRegeneration: boolean = false,
): Promise<string[]> {
  console.log("[CompanyAI:taxonomy] Running local keyword taxonomy for company", companyId);
  const uniqueIds = await assignCapabilitiesLocally(companyId);
  console.log("[CompanyAI:taxonomy] Matched capability IDs:", uniqueIds);

  // aiCapabilityTaxonomy is an AI-only field — always safe to update.
  await db
    .update(companies)
    .set({
      aiCapabilityTaxonomy: uniqueIds,
      taxonomyGeneratedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  // The company_capabilities junction table is a REVIEWABLE_RELATION: once a
  // company has selections (human-verified or manually edited), AI analysis must
  // not overwrite them. But when it is empty, populate it as a first-time pickup
  // — regardless of verification status.
  const [existing] = await db
    .select({ capabilityId: companyCapabilities.capabilityId })
    .from(companyCapabilities)
    .where(eq(companyCapabilities.companyId, companyId))
    .limit(1);

  if (!existing && uniqueIds.length > 0) {
    await db.insert(companyCapabilities).values(
      uniqueIds.map((capabilityId) => ({ companyId, capabilityId })),
    );
  } else if (existing) {
    console.log("[CompanyAI:taxonomy] Skipping junction table update — company already has competencies");
  }

  console.log("[CompanyAI:taxonomy] DB save confirmed for company", companyId);
  return uniqueIds;
}

const LOCAL_MARKETS_MIN_SCORE = 1;
const LOCAL_MARKETS_MAX = 5;

/**
 * Suggest top-level markets for a company using keyword scoring (no AI).
 * Only considers L1 parent markets to keep the candidate set manageable.
 * Stores suggestions in aiAnalysis.aiSuggestedMarkets (never auto-applies).
 */
export async function generateCompanyMarketSuggestions(companyId: string): Promise<string[]> {
  const companyResult = await db
    .select({
      companyName: companies.companyName,
      description: companies.description,
      keyCapabilities: companies.keyCapabilities,
      certifications: companies.certifications,
      equipment: companies.equipment,
      pastProjects: companies.pastProjects,
      aiAnalysis: companies.aiAnalysis,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const company = companyResult[0];
  if (!company) throw new Error("Company not found");

  const parts = [
    company.companyName,
    company.description,
    company.keyCapabilities,
    company.certifications,
    company.equipment,
    company.pastProjects,
  ].filter(Boolean) as string[];

  const companyText = parts.join(" ");
  const companyTextLower = companyText.toLowerCase();
  const companyWords = toSearchWords(companyText);
  if (companyWords.length === 0) return [];

  const l1Markets = await db
    .select({ id: markets.id, name: localizedName(markets.name, markets.nameZh) })
    .from(markets)
    .where(isNull(markets.parentId))
    .orderBy(asc(markets.sortOrder), asc(markets.name));

  if (l1Markets.length === 0) return [];

  const scored = l1Markets.map((m) => ({
    id: m.id,
    score: scoreCapabilityMatch(companyWords, companyTextLower, m.name, null),
  }));

  scored.sort((a, b) => b.score - a.score);
  const suggestedIds = scored
    .filter((s) => s.score >= LOCAL_MARKETS_MIN_SCORE)
    .slice(0, LOCAL_MARKETS_MAX)
    .map((s) => s.id);

  const existingAnalysis = (company.aiAnalysis as Record<string, unknown>) ?? {};
  await db
    .update(companies)
    .set({
      aiAnalysis: { ...existingAnalysis, aiSuggestedMarkets: suggestedIds },
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  // company_markets is a REVIEWABLE_RELATION: only populate it as a first-time
  // pickup when the company has no markets yet. Never overwrite existing
  // selections (human-verified or manually edited), regardless of verification.
  const [existingMarket] = await db
    .select({ marketId: companyMarkets.marketId })
    .from(companyMarkets)
    .where(eq(companyMarkets.companyId, companyId))
    .limit(1);

  if (!existingMarket && suggestedIds.length > 0) {
    await db.insert(companyMarkets).values(
      suggestedIds.map((marketId) => ({ companyId, marketId })),
    );
  } else if (existingMarket) {
    console.log("[CompanyAI:markets] Skipping junction table update — company already has markets");
  }

  return suggestedIds;
}

/**
 * Generate both summary and taxonomy for a company in a single AI call
 * This is more efficient than calling them separately
 * @param companyId - The company ID
 * @param _fullRegeneration - If true, start from base/generic categories only
 * @returns Object with summary and taxonomy IDs
 */
export async function generateCompanySummaryAndTaxonomy(
  companyId: string,
  _fullRegeneration: boolean = false,
): Promise<{ summary: string; taxonomy: string[] }> {
  // Fetch company data
  const result = await db
    .select({
      companyName: companies.companyName,
      description: companies.description,
      keyCapabilities: companies.keyCapabilities,
      certifications: companies.certifications,
      equipment: companies.equipment,
      pastProjects: companies.pastProjects,
      websiteUrl: companies.websiteUrl,
      postcode: companies.postcode,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const company = result[0];

  if (!company) {
    throw new Error("Failed to fetch company: Company not found");
  }

  console.log("[CompanyAI:summary-taxonomy] Company data fetched —", {
    companyName: company.companyName,
    hasDescription: !!company.description,
    hasKeyCapabilities: !!company.keyCapabilities,
    hasCertifications: !!company.certifications,
    hasEquipment: !!company.equipment,
    hasPastProjects: !!company.pastProjects,
    hasWebsiteUrl: !!company.websiteUrl,
    hasPostcode: !!company.postcode,
  });

  // Fetch existing capabilities from static list (cached in-process catalog)
  const existingCapabilities = await getCapabilityCatalog();

  if (!existingCapabilities || existingCapabilities.length === 0) {
    throw new Error("Failed to fetch capabilities: No capabilities found");
  }

  console.log("[CompanyAI:summary-taxonomy] Available capabilities — count:", existingCapabilities.length);

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

  const systemPrompt = `You are an expert at analyzing companies. Generate BOTH a summary AND capability taxonomy in a single response.

CRITICAL RULES - STATIC CAPABILITIES LIST:
- ONLY assign capabilities from the provided STATIC list - DO NOT create new capabilities
- Review the provided capabilities list carefully and match the company to existing items
- Even if the match isn't perfect, use the closest existing capability from the list
- The list is static - no new categories or capabilities can be created
- Select 2-5 capabilities that best match the company

Provide:
1. "summary": A short professional summary (about 80 words): competencies, certifications, market position
2. "existing": Array of 2-5 capability IDs (strings) from the provided STATIC list only`;

  const userPrompt = `Company Details:
Name: ${company.companyName || "N/A"}
Description: ${company.description || "N/A"}
${company.keyCapabilities ? `Key Capabilities: ${company.keyCapabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.pastProjects ? `Past Projects: ${company.pastProjects}` : ""}
${company.websiteUrl ? `Website: ${company.websiteUrl}` : ""}
${company.postcode ? `Location: ${company.postcode}` : ""}

Available Capabilities (STATIC LIST - use only these IDs):
${capabilitiesList}

Respond with a summary and 2-5 capability IDs from the list above.`;

  const validIdSet = new Set(existingCapabilities.map((c) => c.id));

  console.log("[CompanyAI:summary-taxonomy] Prompt —", userPrompt);

  const parsed = await aiGenerateObject({
    schema: companySummaryAndTaxonomySchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 1500,
    estTokens: 2500,
  });

  const summary = parsed.summary;
  const existingIds = (parsed.existing || []).filter((id) => validIdSet.has(id));

  console.log("[CompanyAI:summary-taxonomy] AI response — summary length:", summary.length, "preview:", summary.substring(0, 200));
  console.log("[CompanyAI:summary-taxonomy] AI response — capability IDs:", existingIds);

  // Only use existing capabilities from static list
  const uniqueIds = Array.from(new Set(existingIds));
  console.log("[CompanyAI:summary-taxonomy] Deduplicated IDs — count:", uniqueIds.length, "ids:", uniqueIds);

  // Store both summary and taxonomy in database
  await db
    .update(companies)
    .set({
      aiSummary: summary,
      aiCapabilityTaxonomy: uniqueIds,
      summaryGeneratedAt: new Date(),
      taxonomyGeneratedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
  console.log("[CompanyAI:summary-taxonomy] DB save — summary + taxonomy updated for company", companyId);

  // Atomically replace capability links in the junction table
  await db.transaction(async (tx) => {
    await tx
      .delete(companyCapabilities)
      .where(eq(companyCapabilities.companyId, companyId));

    if (uniqueIds.length > 0) {
      await tx.insert(companyCapabilities).values(
        uniqueIds.map((capabilityId) => ({
          companyId,
          capabilityId,
        })),
      );
    }
  });

  return { summary, taxonomy: uniqueIds };
}
