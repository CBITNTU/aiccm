/* eslint-disable @typescript-eslint/no-explicit-any -- profiles, company_taxonomies extended columns */
import type { ZodType } from "zod";
import { createAdminClient } from "@/lib/api";
import { aiGenerateText, aiGenerateObject } from "@/lib/ai";
import { companySummaryAndTaxonomySchema } from "@/lib/schemas/capabilitySuggestion";

const supabase = createAdminClient();

/** Sleep for ms. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract a JSON object from model text (handles markdown code blocks or trailing text). */
function extractJsonObject(text: string): { summary?: string; existing?: string[] } | null {
  const trimmed = text.trim();
  let jsonStr = trimmed;
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) jsonStr = codeBlock[1].trim();
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1)) as { summary?: string; existing?: string[] };
  } catch {
    return null;
  }
}

/**
 * Call aiGenerateObject with retries to handle transient "no response" / parse errors from the model.
 */
async function retryAiGenerateObject<T>(
  options: Parameters<typeof aiGenerateObject<T>>[0] & { schema: ZodType<T> },
  { maxAttempts = 3, delayMs = 2000 }: { maxAttempts?: number; delayMs?: number },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await aiGenerateObject(options);
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
  }
  throw lastError;
}

/** Max capabilities to send to the model so the prompt fits context (avoids "no response" / parse errors). */
const MAX_CAPABILITIES_IN_PROMPT = 350;

/** Min score (word overlaps) to assign a capability when using local taxonomy. */
const LOCAL_TAXONOMY_MIN_SCORE = 1;

/** Max L1 capabilities to assign per company when using local taxonomy. */
const LOCAL_TAXONOMY_MAX_L1 = 5;

/**
 * Normalize text for scoring: lowercase, collapse whitespace, extract words.
 */
function toSearchWords(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/**
 * Score how well a capability name (and optional category) matches company text.
 * Uses word overlap; bonus if the full name appears as substring.
 */
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
  if (capabilityName && companyTextLower.includes(capabilityName.toLowerCase())) {
    score += 2;
  }
  if (category && companyTextLower.includes((category as string).toLowerCase())) {
    score += 2;
  }
  return score;
}

/**
 * Fetch L1 (domain) capabilities only for local taxonomy.
 */
async function getL1Capabilities(): Promise<
  Array<{ id: string; name: string; category: string | null }>
> {
  const { data, error } = await supabase
    .from("company_capabilities_ref")
    .select("id, name, category")
    .eq("is_active", true)
    .is("parent_id", null)
    .order("name");

  if (error) return [];
  return (data || []) as Array<{ id: string; name: string; category: string | null }>;
}

/**
 * Assign capabilities to a company using local keyword matching (no AI).
 * Returns 2–5 L1 capability IDs that best match the company text.
 */
async function assignCapabilitiesLocally(companyId: string): Promise<string[]> {
  const { data: company, error } = await supabase
    .from("companies")
    .select(
      "company_name, description, key_capabilities, certifications, equipment, past_projects",
    )
    .eq("id", companyId)
    .single();

  if (error || !company) {
    throw new Error(
      `Failed to fetch company: ${error?.message || "Company not found"}`,
    );
  }

  const parts = [
    company.company_name,
    company.description,
    company.key_capabilities,
    company.certifications,
    company.equipment,
    company.past_projects,
  ].filter(Boolean) as string[];

  const companyText = parts.join(" ");
  const companyTextLower = companyText.toLowerCase();
  const companyWords = toSearchWords(companyText);
  if (companyWords.length === 0) return [];

  const l1Caps = await getL1Capabilities();
  if (l1Caps.length === 0) return [];

  const scored = l1Caps.map((cap) => ({
    id: cap.id,
    score: scoreCapabilityMatch(
      companyWords,
      companyTextLower,
      cap.name,
      cap.category,
    ),
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored
    .filter((s) => s.score >= LOCAL_TAXONOMY_MIN_SCORE)
    .slice(0, LOCAL_TAXONOMY_MAX_L1)
    .map((s) => s.id);

  return top;
}

/**
 * Size comparison (approx):
 * - Old EIC taxonomy: ~15 categories, ~283 items → ~17k chars in prompt.
 * - CSV taxonomy: 40 L1 + 271 L2 + 1165 L3 = 1476 total (~5.2× EIC). Full list would be ~88k chars.
 * We send only L1 (40 items, ~2.4k chars) for reliability; optionally L1+L2 (311, ~19k) if L1-only is disabled.
 */
/**
 * Fetch capabilities for the AI prompt. Sends only L1 (domains) when hierarchy exists, so the prompt
 * is smaller than the old EIC taxonomy and fits context. Falls back to L1+L2 (capped) or category grouping with a cap.
 */
async function getCapabilitiesForPrompt(): Promise<
  Array<{ id: string; name: string; category: string | null; parent_id: string | null }>
> {
  const allCaps: Array<{ id: string; name: string; category: string | null; parent_id: string | null }> = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data: page, error } = await supabase
      .from("company_capabilities_ref")
      .select("id, name, category, parent_id")
      .eq("is_active", true)
      .order("category")
      .order("name")
      .range(offset, offset + pageSize - 1);
    if (error) return [];
    if (!page?.length) break;
    allCaps.push(...(page as typeof allCaps));
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  if (allCaps.length === 0) return [];

  const hasParentId = allCaps.some((c: any) => c.parent_id != null && c.parent_id !== "");
  if (hasParentId) {
    // Prefer only L1 (domains) for smallest prompt and most reliable response; cap at 60
    const l1Only = allCaps.filter((c: any) => !c.parent_id);
    if (l1Only.length > 0 && l1Only.length <= 60) {
      return l1Only;
    }
    const rootIds = new Set(
      allCaps.filter((c: any) => !c.parent_id).map((c: any) => c.id),
    );
    const l1AndL2 = allCaps.filter(
      (c: any) => !c.parent_id || rootIds.has(c.parent_id),
    );
    return l1AndL2.slice(0, MAX_CAPABILITIES_IN_PROMPT);
  }

  const byCategory: Record<string, typeof allCaps> = {};
  for (const cap of allCaps) {
    const cat = (cap as any).category || "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(cap);
  }
  const flat: typeof allCaps = [];
  for (const caps of Object.values(byCategory)) {
    for (const c of caps.slice(0, 15)) flat.push(c);
    if (flat.length >= MAX_CAPABILITIES_IN_PROMPT) break;
  }
  return flat.slice(0, MAX_CAPABILITIES_IN_PROMPT) as Array<{
    id: string;
    name: string;
    category: string | null;
    parent_id: string | null;
  }>;
}

/**
 * Generate AI summary for a company
 */
export async function generateCompanySummary(
  companyId: string,
): Promise<string> {
  // Fetch company data
  const { data: company, error } = await supabase
    .from("companies")
    .select(
      "company_name, description, key_capabilities, certifications, equipment, past_projects, website_url, postcode",
    )
    .eq("id", companyId)
    .single();

  if (error || !company) {
    throw new Error(
      `Failed to fetch company: ${error?.message || "Company not found"}`,
    );
  }

  // Fetch company capabilities from junction table
  const { data: companyCapabilities } = await supabase
    .from("company_capabilities")
    .select("company_capabilities_ref(id, name, category)")
    .eq("company_id", companyId);

  const capabilitiesList =
    companyCapabilities
      ?.map((cc: any) => cc.company_capabilities_ref?.name)
      .filter(Boolean)
      .join(", ") || "";

  const systemPrompt = `Generate a 200-word professional summary: competencies, achievements, certifications, market position, differentiators. Be specific.`;

  const userPrompt = `Company Details:
Name: ${company.company_name || "N/A"}
Description: ${company.description || "N/A"}
${capabilitiesList ? `Capabilities: ${capabilitiesList}` : ""}
${company.key_capabilities ? `Key Capabilities: ${company.key_capabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.past_projects ? `Past Projects: ${company.past_projects}` : ""}
${company.website_url ? `Website: ${company.website_url}` : ""}
${company.postcode ? `Location: ${company.postcode}` : ""}

Summarize.`;

  const summary = await aiGenerateText({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 1000,
    estTokens: 2000,
  });

  // Store summary in database
  const { error: updateError } = await supabase
    .from("companies" as any)
    .update({
      ai_summary: summary,
      summary_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", companyId);

  if (updateError) {
    throw new Error(`Failed to store summary: ${updateError.message}`);
  }

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
  // Local taxonomy (keyword matching); AI is used only for summary.
  const uniqueIds = await assignCapabilitiesLocally(companyId);

  // Store taxonomy in database
  const { error: updateError } = await supabase
    .from("companies" as any)
    .update({
      ai_capability_taxonomy: uniqueIds,
      taxonomy_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", companyId);

  if (updateError) {
    throw new Error(`Failed to store taxonomy: ${updateError.message}`);
  }

  // Also populate the company_capabilities junction table for filtering
  // First, delete existing capability links for this company
  const { error: deleteError } = await supabase
    .from("company_capabilities")
    .delete()
    .eq("company_id", companyId);

  if (deleteError) {
    console.warn(
      `Failed to delete existing capabilities for company ${companyId}:`,
      deleteError,
    );
  }

  // Insert new capability links
  if (uniqueIds.length > 0) {
    const capabilityLinks = uniqueIds.map((capabilityId) => ({
      company_id: companyId,
      capability_id: capabilityId,
    }));

    const { error: insertError } = await supabase
      .from("company_capabilities")
      .insert(capabilityLinks);

    if (insertError) {
      console.error(
        `Failed to insert capability links for company ${companyId}:`,
        insertError,
      );
    } else {
      console.log(
        `Populated ${uniqueIds.length} capabilities in junction table for company ${companyId}`,
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
  const { data: company, error } = await supabase
    .from("companies")
    .select(
      "company_name, description, key_capabilities, certifications, equipment, past_projects, website_url, postcode",
    )
    .eq("id", companyId)
    .single();

  if (error || !company) {
    throw new Error(
      `Failed to fetch company: ${error?.message || "Company not found"}`,
    );
  }

  const existingCapabilities = await getCapabilitiesForPrompt();
  if (existingCapabilities.length === 0) {
    throw new Error("No capabilities in reference list");
  }

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
Name: ${company.company_name || "N/A"}
Description: ${company.description || "N/A"}
${company.key_capabilities ? `Key Capabilities: ${company.key_capabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.past_projects ? `Past Projects: ${company.past_projects}` : ""}
${company.website_url ? `Website: ${company.website_url}` : ""}
${company.postcode ? `Location: ${company.postcode}` : ""}

Available Capabilities (STATIC LIST - use only these IDs):
${capabilitiesList}

Respond with a summary and 2-5 capability IDs from the list above.`;

  const validIdSet = new Set(existingCapabilities.map((c) => c.id));

  let parsed: { summary: string; existing: string[] };
  try {
    parsed = await retryAiGenerateObject(
      {
        schema: companySummaryAndTaxonomySchema,
        system: systemPrompt,
        prompt: userPrompt,
        maxTokens: 1500,
        estTokens: 2500,
      },
      { maxAttempts: 3, delayMs: 2000 },
    );
  } catch {
    // Fallback: generateText + parse JSON (more reliable when structured output fails)
    const jsonPrompt = `${userPrompt}\n\nRespond with ONLY a valid JSON object, no markdown or other text. Example: {"summary":"Short company summary here.","existing":["uuid-1","uuid-2"]}`;
    const raw = await aiGenerateText({
      system: systemPrompt + "\n\nOutput format: valid JSON only, keys summary and existing.",
      prompt: jsonPrompt,
      maxTokens: 1200,
      estTokens: 1500,
    });
    const extracted = extractJsonObject(raw);
    if (!extracted) {
      throw new Error("Model response could not be parsed as JSON");
    }
    parsed = {
      summary: typeof extracted.summary === "string" ? extracted.summary.slice(0, 3000) : "Summary unavailable.",
      existing: Array.isArray(extracted.existing) ? extracted.existing.map(String) : [],
    };
  }

  const summary = parsed.summary;
  const existingIds = (parsed.existing || []).filter((id) => validIdSet.has(id));

  // Only use existing capabilities from static list
  const uniqueIds = Array.from(new Set(existingIds));

  // Store both summary and taxonomy in database
  const { error: updateError } = await supabase
    .from("companies" as any)
    .update({
      ai_summary: summary,
      ai_capability_taxonomy: uniqueIds,
      summary_generated_at: new Date().toISOString(),
      taxonomy_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", companyId);

  if (updateError) {
    throw new Error(
      `Failed to store summary and taxonomy: ${updateError.message}`,
    );
  }

  // Also populate the company_capabilities junction table
  const { error: deleteError } = await supabase
    .from("company_capabilities")
    .delete()
    .eq("company_id", companyId);

  if (deleteError) {
    console.warn(
      `Failed to delete existing capabilities for company ${companyId}:`,
      deleteError,
    );
  }

  // Insert new capability links
  if (uniqueIds.length > 0) {
    const capabilityLinks = uniqueIds.map((capabilityId) => ({
      company_id: companyId,
      capability_id: capabilityId,
    }));

    const { error: insertError } = await supabase
      .from("company_capabilities")
      .insert(capabilityLinks);

    if (insertError) {
      console.error(
        `Failed to insert capability links for company ${companyId}:`,
        insertError,
      );
    }
  }

  return { summary, taxonomy: uniqueIds };
}
