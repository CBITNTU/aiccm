/* eslint-disable @typescript-eslint/no-explicit-any -- profiles, company_taxonomies extended columns */
import { createAdminClient } from "@/lib/api";
import { aiGenerateText, aiGenerateObject } from "@/lib/ai";
import {
  existingCapabilitiesSchema,
  companySummaryAndTaxonomySchema,
} from "@/lib/schemas/capabilitySuggestion";

const supabase = createAdminClient();

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
  // Fetch company data
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

  // Fetch existing capabilities from static list
  const { data: existingCapabilities, error: capsError } = await supabase
    .from("company_capabilities_ref")
    .select("id, name, category")
    .order("category")
    .order("name");

  if (capsError || !existingCapabilities) {
    throw new Error(
      `Failed to fetch capabilities: ${capsError?.message || "Unknown error"}`,
    );
  }

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
Name: ${company.company_name || "N/A"}
Description: ${company.description || "N/A"}
${company.key_capabilities ? `Key Capabilities: ${company.key_capabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.past_projects ? `Past Projects: ${company.past_projects}` : ""}

Available Capabilities:
${capabilitiesList}

Return existing = array of capability IDs from the list.`;

  const parsed = await aiGenerateObject({
    schema: existingCapabilitiesSchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 4000,
    estTokens: 3000,
  });

  const existingIds = parsed.existing;

  // Only use existing capabilities from static list
  const uniqueIds = Array.from(new Set(existingIds));

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

  // Fetch existing capabilities from static list
  const { data: existingCapabilities, error: capsError } = await supabase
    .from("company_capabilities_ref")
    .select("id, name, category")
    .order("category")
    .order("name");

  if (capsError || !existingCapabilities) {
    throw new Error(
      `Failed to fetch capabilities: ${capsError?.message || "Unknown error"}`,
    );
  }

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

  const systemPrompt = `You are an expert at analyzing companies. Generate BOTH a summary AND capability taxonomy in a single response.

CRITICAL RULES - STATIC CAPABILITIES LIST:
- ONLY assign capabilities from the provided STATIC list - DO NOT create new capabilities
- Review the provided capabilities list carefully and match the company to existing items
- Even if the match isn't perfect, use the closest existing capability from the list
- The list is static - no new categories or capabilities can be created
- Select 2-5 capabilities that best match the company

Provide:
1. "summary": A concise 200-word professional summary covering core competencies, achievements, certifications, market position, and unique value propositions
2. "existing": Array of capability IDs (strings) from the provided STATIC list only`;

  const userPrompt = `Company Details:
Name: ${company.company_name || "N/A"}
Description: ${company.description || "N/A"}
${company.key_capabilities ? `Key Capabilities: ${company.key_capabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.past_projects ? `Past Projects: ${company.past_projects}` : ""}
${company.website_url ? `Website: ${company.website_url}` : ""}
${company.postcode ? `Location: ${company.postcode}` : ""}

Available Capabilities (STATIC LIST - DO NOT CREATE NEW ONES):
${capabilitiesList}

Generate a summary and select relevant capability IDs from the STATIC list above only.`;

  const parsed = await aiGenerateObject({
    schema: companySummaryAndTaxonomySchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 2500,
    estTokens: 3500,
  });

  const summary = parsed.summary;
  const existingIds = parsed.existing;

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
