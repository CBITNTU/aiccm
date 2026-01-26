import { createAdminClient, chatCompletion } from "@/lib/api";
import { runLLM } from "./llmLimiter";

const supabase = createAdminClient();

/**
 * Generate AI summary for a company
 */
export async function generateCompanySummary(companyId: string): Promise<string> {
  // Fetch company data
  const { data: company, error } = await supabase
    .from("companies")
    .select("company_name, description, key_capabilities, certifications, equipment, past_projects, website_url, postcode")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    throw new Error(`Failed to fetch company: ${error?.message || "Company not found"}`);
  }

  // Fetch company capabilities from junction table
  const { data: companyCapabilities } = await supabase
    .from("company_capabilities")
    .select("company_capabilities_ref(id, name, category)")
    .eq("company_id", companyId);

  const capabilitiesList = companyCapabilities
    ?.map((cc: any) => cc.company_capabilities_ref?.name)
    .filter(Boolean)
    .join(", ") || "";

  const systemPrompt = `You are an expert at analyzing companies and creating professional summaries.
Generate a concise, professional 200-word summary of this company, covering:
- Core competencies and specializations
- Key achievements and past projects
- Certifications and qualifications
- Market position and strengths
- Unique value propositions

Be specific and highlight what makes this company stand out.`;

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

Generate a concise 200-word professional summary of this company.`;

  // Call OpenAI with rate limiting
  const summary = await runLLM(
    async () => {
      const response = await chatCompletion(systemPrompt, userPrompt, {
        model: "gpt-5-mini",
        temperature: 0.3,
        maxTokens: 500,
      });
      return response;
    },
    2000 // Estimated tokens
  );

  // Store summary in database
  const { error: updateError } = await (supabase
    .from("companies" as any)
    .update({
      ai_summary: summary,
      summary_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", companyId));

  if (updateError) {
    throw new Error(`Failed to store summary: ${updateError.message}`);
  }

  return summary;
}

/**
 * Generate capability taxonomy for a company
 * Returns array of capability IDs and creates new capabilities if needed
 * @param companyId - The company ID
 * @param fullRegeneration - If true, start from base/generic categories only. If false, show all capabilities for incremental updates.
 */
export async function generateCompanyCapabilityTaxonomy(
  companyId: string,
  fullRegeneration: boolean = false
): Promise<string[]> {
  // Fetch company data
  const { data: company, error } = await supabase
    .from("companies")
    .select("company_name, description, key_capabilities, certifications, equipment, past_projects")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    throw new Error(`Failed to fetch company: ${error?.message || "Company not found"}`);
  }

  // Fetch existing capabilities from static list
  const { data: existingCapabilities, error: capsError } = await supabase
    .from("company_capabilities_ref")
    .select("id, name, category")
    .order("category")
    .order("name");

  if (capsError || !existingCapabilities) {
    throw new Error(`Failed to fetch capabilities: ${capsError?.message || "Unknown error"}`);
  }

  // Format capabilities for AI
  const capabilitiesByCategory: Record<string, Array<{ id: string; name: string }>> = {};
  existingCapabilities.forEach((cap) => {
    const category = cap.category || "Uncategorized";
    if (!capabilitiesByCategory[category]) {
      capabilitiesByCategory[category] = [];
    }
    capabilitiesByCategory[category].push({ id: cap.id, name: cap.name });
  });

  const capabilitiesList = Object.entries(capabilitiesByCategory)
    .map(([category, caps]) => 
      `${category}:\n  ${caps.map(c => `- ${c.name} (ID: ${c.id})`).join("\n  ")}`
    )
    .join("\n\n");

  const systemPrompt = `You are an expert at analyzing companies and identifying their capabilities.
Your task is to analyze a company profile and identify relevant capabilities from the STATIC list provided.

CRITICAL RULES - STATIC CAPABILITIES LIST:
- ONLY assign capabilities from the provided STATIC list - DO NOT create new capabilities
- Review the provided capabilities list carefully and match the company to existing items
- Even if the match isn't perfect, use the closest existing capability from the list
- The list is static - no new categories or capabilities can be created
- Select 2-5 capabilities that best match the company

CRITICAL FORMATTING RULES:
- Return ONLY valid JSON - nothing else
- NO comments (// or /* */) anywhere in the response
- NO explanations or text before or after the JSON
- NO markdown code blocks (no \`\`\`json\`\`\`)
- Start with { and end with }
- Use only double quotes for strings
- Do NOT add comments after values

Return a JSON object with one array:
- "existing": Array of capability IDs (strings) from the provided STATIC list that accurately represent the company

Example (copy this exact format, no comments):
{"existing": ["capability-id-1", "capability-id-2"]}

Be accurate and comprehensive - include all capabilities the company clearly has.`;

  const userPrompt = `Company Details:
Name: ${company.company_name || "N/A"}
Description: ${company.description || "N/A"}
${company.key_capabilities ? `Key Capabilities: ${company.key_capabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.past_projects ? `Past Projects: ${company.past_projects}` : ""}

Available Capabilities (STATIC LIST - DO NOT CREATE NEW ONES):
${capabilitiesList}

Analyze this company and return ONLY a valid JSON object (no comments, no explanations, no markdown) with relevant capability IDs from the STATIC list only.`;

  // Call OpenAI with rate limiting
  const response = await runLLM(
    async () => {
      const aiResponse = await chatCompletion(systemPrompt, userPrompt, {
        model: "gpt-5-mini",
        maxTokens: 4000, // Increased for default reasoning tokens plus output
        responseFormat: "json_object", // Request JSON output format
      });
      return aiResponse;
    },
    3000 // Estimated tokens
  );

  // Parse AI response - only existing capabilities, no new ones
  let existingIds: string[] = [];

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      existingIds = Array.isArray(parsed.existing) ? parsed.existing : [];
    }
  } catch (e) {
    console.error("Failed to parse AI response for capabilities:", e);
    // Try to extract just the existing IDs if new format fails
    const arrayMatch = response.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      existingIds = JSON.parse(arrayMatch[0]);
    }
  }

  // Only use existing capabilities from static list
  const uniqueIds = Array.from(new Set(existingIds));

  // Store taxonomy in database
  const { error: updateError } = await (supabase
    .from("companies" as any)
    .update({
      ai_capability_taxonomy: uniqueIds,
      taxonomy_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", companyId));

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
    console.warn(`Failed to delete existing capabilities for company ${companyId}:`, deleteError);
    // Don't throw - we'll try to insert anyway
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
      console.error(`Failed to insert capability links for company ${companyId}:`, insertError);
      // Don't throw - taxonomy is stored, just junction table failed
      // This is a non-critical error, but we should log it
    } else {
      console.log(`✅ Populated ${uniqueIds.length} capabilities in junction table for company ${companyId}`);
    }
  }

  return uniqueIds;
}

/**
 * Generate both summary and taxonomy for a company in a single AI call
 * This is more efficient than calling them separately
 * @param companyId - The company ID
 * @param fullRegeneration - If true, start from base/generic categories only
 * @returns Object with summary and taxonomy IDs
 */
export async function generateCompanySummaryAndTaxonomy(
  companyId: string,
  fullRegeneration: boolean = false
): Promise<{ summary: string; taxonomy: string[] }> {
  // Fetch company data
  const { data: company, error } = await supabase
    .from("companies")
    .select("company_name, description, key_capabilities, certifications, equipment, past_projects, website_url, postcode")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    throw new Error(`Failed to fetch company: ${error?.message || "Company not found"}`);
  }

  // Fetch existing capabilities from static list
  const { data: existingCapabilities, error: capsError } = await supabase
    .from("company_capabilities_ref")
    .select("id, name, category")
    .order("category")
    .order("name");

  if (capsError || !existingCapabilities) {
    throw new Error(`Failed to fetch capabilities: ${capsError?.message || "Unknown error"}`);
  }

  // Format capabilities for AI
  const capabilitiesByCategory: Record<string, Array<{ id: string; name: string }>> = {};
  existingCapabilities.forEach((cap) => {
    const category = cap.category || "Uncategorized";
    if (!capabilitiesByCategory[category]) {
      capabilitiesByCategory[category] = [];
    }
    capabilitiesByCategory[category].push({ id: cap.id, name: cap.name });
  });

  const capabilitiesList = Object.entries(capabilitiesByCategory)
    .map(([category, caps]) => 
      `${category}:\n  ${caps.map(c => `- ${c.name} (ID: ${c.id})`).join("\n  ")}`
    )
    .join("\n\n");

  const systemPrompt = `You are an expert at analyzing companies. Generate BOTH a summary AND capability taxonomy in a single response.

CRITICAL RULES - STATIC CAPABILITIES LIST:
- ONLY assign capabilities from the provided STATIC list - DO NOT create new capabilities
- Review the provided capabilities list carefully and match the company to existing items
- Even if the match isn't perfect, use the closest existing capability from the list
- The list is static - no new categories or capabilities can be created
- Select 2-5 capabilities that best match the company

CRITICAL FORMATTING RULES:
- Return ONLY valid JSON - nothing else
- NO comments (// or /* */) anywhere in the response
- NO explanations or text before or after the JSON
- NO markdown code blocks (no \`\`\`json\`\`\`)
- Start with { and end with }
- Use only double quotes for strings
- Do NOT add comments after values

Return a JSON object with:
1. "summary": A concise 200-word professional summary covering core competencies, achievements, certifications, market position, and unique value propositions
2. "existing": Array of capability IDs (strings) from the provided STATIC list only

Example (copy this exact format, no comments):
{"summary": "Company summary text here...", "existing": ["capability-id-1", "capability-id-2"]}`;

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

Generate a JSON object with:
- "summary": Professional 200-word company summary
- "existing": Array of relevant capability IDs from the STATIC list above only

Return ONLY valid JSON (no comments, no explanations, no markdown).`;

  // Call OpenAI with rate limiting (single call for both tasks)
  const response = await runLLM(
    async () => {
      const aiResponse = await chatCompletion(systemPrompt, userPrompt, {
        model: "gpt-5-mini",
        temperature: 0.3,
        maxTokens: 2500, // Slightly higher for combined output
      });
      return aiResponse;
    },
    3500 // Estimated tokens for combined request
  );

  // Parse AI response - only existing capabilities, no new ones
  let summary = "";
  let existingIds: string[] = [];

  try {
    const parsed = JSON.parse(response);
    summary = parsed.summary || "";
    existingIds = Array.isArray(parsed.existing) ? parsed.existing : [];
  } catch (e) {
    console.error("Failed to parse AI response for combined summary/taxonomy:", e);
    // Try to extract just summary if JSON parsing fails
    const summaryMatch = response.match(/"summary"\s*:\s*"([^"]+)"/);
    if (summaryMatch) {
      summary = summaryMatch[1];
    }
  }

  // Only use existing capabilities from static list
  const uniqueIds = Array.from(new Set(existingIds));

  // Store both summary and taxonomy in database
  const { error: updateError } = await (supabase
    .from("companies" as any)
    .update({
      ai_summary: summary,
      ai_capability_taxonomy: uniqueIds,
      summary_generated_at: new Date().toISOString(),
      taxonomy_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", companyId));

  if (updateError) {
    throw new Error(`Failed to store summary and taxonomy: ${updateError.message}`);
  }

  // Also populate the company_capabilities junction table
  const { error: deleteError } = await supabase
    .from("company_capabilities")
    .delete()
    .eq("company_id", companyId);

  if (deleteError) {
    console.warn(`Failed to delete existing capabilities for company ${companyId}:`, deleteError);
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
      console.error(`Failed to insert capability links for company ${companyId}:`, insertError);
    }
  }

  return { summary, taxonomy: uniqueIds };
}
