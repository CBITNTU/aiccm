import { db } from "@/lib/db";
import {
  companies,
  companyCapabilities,
  companyCapabilitiesRef,
} from "@/lib/db/schema/app";
import { eq, asc } from "drizzle-orm";
import { aiGenerateText, aiGenerateObject } from "@/lib/ai";
import { companySummaryAndTaxonomySchema } from "@/lib/schemas/capabilitySuggestion";

// TODO [MERGE]: migrate to Drizzle — HEAD imported Supabase client:
// import { createAdminClient } from "@/lib/api";
// const supabase = createAdminClient();

// TODO [MERGE]: migrate to Drizzle — HEAD helper functions for reference:
// function sleep(ms: number): Promise<void> { ... }
// function extractJsonObject(text: string): { summary?: string; existing?: string[] } | null { ... }
// async function retryAiGenerateObject<T>(options, { maxAttempts, delayMs }): Promise<T> { ... }

// TODO [MERGE]: migrate local taxonomy system to Drizzle
// HEAD had a full local taxonomy system (keyword matching, no AI):
// - Constants: MAX_CAPABILITIES_IN_PROMPT=350, LOCAL_TAXONOMY_MIN_SCORE=1, LOCAL_TAXONOMY_MAX_L1=5
// - toSearchWords(text): string[] — normalize text for scoring
// - scoreCapabilityMatch(companyWords, companyTextLower, capabilityName, category): number
// - getL1Capabilities(): Promise<Array<{id,name,category}>> — fetch L1 capabilities via Supabase
// - assignCapabilitiesLocally(companyId): Promise<string[]> — keyword-based capability assignment
// - getCapabilitiesForPrompt(): Promise<Array<{id,name,category,parent_id}>> — paginated Supabase fetch

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
    .select({ name: companyCapabilitiesRef.name })
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
 * Generate capability taxonomy for a company
 * Returns array of capability IDs and creates new capabilities if needed
 * @param companyId - The company ID
 * @param _fullRegeneration - If true, start from base/generic categories only. If false, show all capabilities for incremental updates.
 */
export async function generateCompanyCapabilityTaxonomy(
  companyId: string,
  _fullRegeneration: boolean = false,
): Promise<string[]> {
  // TODO [MERGE]: HEAD used local keyword matching (assignCapabilitiesLocally) instead of AI

  // Fetch company data
  const result = await db
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

  const company = result[0];

  if (!company) {
    throw new Error("Failed to fetch company: Company not found");
  }

  console.log("[CompanyAI:taxonomy] Company data fetched —", {
    companyName: company.companyName,
    hasDescription: !!company.description,
    hasKeyCapabilities: !!company.keyCapabilities,
    hasCertifications: !!company.certifications,
    hasEquipment: !!company.equipment,
    hasPastProjects: !!company.pastProjects,
  });

  // Fetch existing capabilities from static list
  const existingCapabilities = await db
    .select({
      id: companyCapabilitiesRef.id,
      name: companyCapabilitiesRef.name,
      category: companyCapabilitiesRef.category,
    })
    .from(companyCapabilitiesRef)
    .orderBy(asc(companyCapabilitiesRef.category), asc(companyCapabilitiesRef.name));

  if (!existingCapabilities || existingCapabilities.length === 0) {
    throw new Error("Failed to fetch capabilities: No capabilities found");
  }

  console.log("[CompanyAI:taxonomy] Available capabilities from static list — count:", existingCapabilities.length);

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

  const systemPrompt = `From the STATIC capability list below, pick 2-5 IDs that best match the company. Do not create new capabilities.`;

  const userPrompt = `Company Details:
Name: ${company.companyName || "N/A"}
Description: ${company.description || "N/A"}
${company.keyCapabilities ? `Key Capabilities: ${company.keyCapabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.pastProjects ? `Past Projects: ${company.pastProjects}` : ""}

Available Capabilities:
${capabilitiesList}

Return existing = array of capability IDs from the list.`;

  console.log("[CompanyAI:taxonomy] Prompt —", userPrompt);

  const parsed = await aiGenerateObject({
    schema: companySummaryAndTaxonomySchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 4000,
    estTokens: 3000,
  });

  const existingIds = parsed.existing;
  console.log("[CompanyAI:taxonomy] AI-returned capability IDs —", existingIds);

  // Only use existing capabilities from static list
  const uniqueIds = Array.from(new Set(existingIds));
  console.log("[CompanyAI:taxonomy] Deduplicated IDs — count:", uniqueIds.length, "ids:", uniqueIds);

  // Store taxonomy in database
  await db
    .update(companies)
    .set({
      aiCapabilityTaxonomy: uniqueIds,
      taxonomyGeneratedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
  console.log("[CompanyAI:taxonomy] DB save — aiCapabilityTaxonomy updated for company", companyId);

  // Also populate the company_capabilities junction table for filtering
  // First, delete existing capability links for this company
  try {
    await db
      .delete(companyCapabilities)
      .where(eq(companyCapabilities.companyId, companyId));
  } catch (deleteError) {
    console.warn(
      `Failed to delete existing capabilities for company ${companyId}:`,
      deleteError,
    );
  }

  // Insert new capability links
  if (uniqueIds.length > 0) {
    try {
      await db.insert(companyCapabilities).values(
        uniqueIds.map((capabilityId) => ({
          companyId,
          capabilityId,
        })),
      );
      console.log(
        `Populated ${uniqueIds.length} capabilities in junction table for company ${companyId}`,
      );
    } catch (insertError) {
      console.error(
        `Failed to insert capability links for company ${companyId}:`,
        insertError,
      );
    }
  }

  return uniqueIds;
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

  // Fetch existing capabilities from static list (direct Drizzle query)
  const existingCapabilities = await db
    .select({
      id: companyCapabilitiesRef.id,
      name: companyCapabilitiesRef.name,
      category: companyCapabilitiesRef.category,
    })
    .from(companyCapabilitiesRef)
    .orderBy(asc(companyCapabilitiesRef.category), asc(companyCapabilitiesRef.name));

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

  // Also populate the company_capabilities junction table
  try {
    await db
      .delete(companyCapabilities)
      .where(eq(companyCapabilities.companyId, companyId));
  } catch (deleteError) {
    console.warn(
      `Failed to delete existing capabilities for company ${companyId}:`,
      deleteError,
    );
  }

  // Insert new capability links
  if (uniqueIds.length > 0) {
    try {
      await db.insert(companyCapabilities).values(
        uniqueIds.map((capabilityId) => ({
          companyId,
          capabilityId,
        })),
      );
    } catch (insertError) {
      console.error(
        `Failed to insert capability links for company ${companyId}:`,
        insertError,
      );
    }
  }

  return { summary, taxonomy: uniqueIds };
}
