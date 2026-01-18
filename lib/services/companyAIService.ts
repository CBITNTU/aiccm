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
        model: "gpt-4o-mini",
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

  // Define base/generic categories for full regeneration mode
  // These are the top-level, generic categories that should be used as starting point
  // IMPORTANT: Keep this comprehensive to match the actual categories in the database
  const baseCategories = [
    "Agriculture & Forestry",
    "Assembly & Fabrication",
    "Business Processes",
    "Casting, Moulding, Forming, & Forging",
    "Construction",
    "Craft and Trade Processes",
    "Design",
    "Electrical & Electronics",
    "Eroding (EDM)",
    "ICT Process",
    "Industrial Furnaces",
    "Machining",
    "Metal Forming & Press-work",
    "Printing, Photography & Ink Stamps",
    "Prototyping",
    "Quality, Statistics & Measurement",
    "Renewable Energy",
    "Renewable Materials",
    "Research & Development",
    "Services",
    "Sintering",
    "Supply Chain",
    "Surface treatment & coating",
    "Tooling",
    "Welding, brazing & soldering",
  ];

  // Fetch existing capabilities - show ALL capabilities so AI can see custom categories too
  // This prevents the AI from creating duplicate categories that already exist
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

  const regenerationMode = fullRegeneration 
    ? "FULL REGENERATION MODE: Prefer existing capabilities from the provided list. You CAN create new BROAD archetype categories (e.g., 'Healthcare', 'Environmental') if they don't exist, but NEVER create multiple specific categories for the same archetype. Keep capability names broad and generic."
    : "INCREMENTAL MODE: Review the company's current capabilities and make additions/removals as needed. You can use any capability from the full list and create new broad categories when needed.";

  const systemPrompt = `You are an expert at analyzing companies and identifying their capabilities.
Your task is to analyze a company profile and identify relevant capabilities.

${regenerationMode}

CRITICAL RULES - READ CAREFULLY:

UNDERSTAND THE HIERARCHY:
- CATEGORIES = BROAD ARCHETYPES (e.g., "Healthcare", "IT", "Environmental", "Construction", "Services")
- CAPABILITY NAMES = More specific items under a category (e.g., "Software Engineering" under "IT", "Services" under "Healthcare")

CATEGORY RULES (MOST IMPORTANT):
1. Use existing categories from the provided list when available (e.g., "Services", "Construction", "ICT Process")
2. You CAN create new BROAD archetype categories if needed (e.g., "Healthcare", "Environmental", "IT") - but ONLY if they're truly broad archetypes
3. NEVER create multiple specific categories for the same archetype:
   - BAD: "Healthcare Services", "Healthcare Equipment", "Healthcare Logistics" as separate categories
   - GOOD: "Healthcare" as ONE category with capability names: "Services", "Equipment Supply", "Logistics"
4. Categories are VERY BROAD archetypes - think industry/sector level, not specific services

CAPABILITY NAME RULES:
1. ALWAYS prefer EXISTING capabilities from the provided list
2. When creating new capabilities, keep names BROAD and generic:
   - GOOD: "Services", "Equipment Supply", "Software Engineering"
   - BAD: "Healthcare Compliance Services", "Healthcare Equipment Supply"
3. If a company does healthcare work, create capability names like "Services", "Equipment Supply" under the "Healthcare" category
4. Select 2-5 capabilities - be conservative and use broad names

CRITICAL FORMATTING RULES:
- Return ONLY valid JSON - nothing else
- NO comments (// or /* */) anywhere in the response
- NO explanations or text before or after the JSON
- NO markdown code blocks (no \`\`\`json\`\`\`)
- Start with { and end with }
- Use only double quotes for strings
- Do NOT add comments after values like "id", // comment

Return a JSON object with two arrays:
1. "existing": Array of capability IDs (strings) from the provided list that accurately represent the company
2. "new": Array of objects with "name" and "category" for new capabilities not in the list

Example (copy this exact format, no comments):
{"existing": ["capability-id-1", "capability-id-2"], "new": [{"name": "New Capability", "category": "Category Name"}]}

Be accurate and comprehensive - include all capabilities the company clearly has.`;

  const userPrompt = `Company Details:
Name: ${company.company_name || "N/A"}
Description: ${company.description || "N/A"}
${company.key_capabilities ? `Key Capabilities: ${company.key_capabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.past_projects ? `Past Projects: ${company.past_projects}` : ""}

Available Capabilities:
${capabilitiesList}

Analyze this company and return ONLY a valid JSON object (no comments, no explanations, no markdown) with relevant capability IDs and any new capabilities needed.`;

  // Call OpenAI with rate limiting
  const response = await runLLM(
    async () => {
      const aiResponse = await chatCompletion(systemPrompt, userPrompt, {
        model: "gpt-4o-mini",
        temperature: 0.3,
        maxTokens: 2000,
      });
      return aiResponse;
    },
    3000 // Estimated tokens
  );

  // Parse AI response
  let existingIds: string[] = [];
  let newCapabilities: Array<{ name: string; category: string }> = [];

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      existingIds = Array.isArray(parsed.existing) ? parsed.existing : [];
      newCapabilities = Array.isArray(parsed.new) ? parsed.new : [];
    }
  } catch (e) {
    console.error("Failed to parse AI response for capabilities:", e);
    // Try to extract just the existing IDs if new format fails
    const arrayMatch = response.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      existingIds = JSON.parse(arrayMatch[0]);
    }
  }

  // Create new capabilities and remove duplicates
  const createdIds: string[] = [];
  for (const newCap of newCapabilities) {
    if (!newCap.name || !newCap.category) continue;

    // Check if capability already exists (case-insensitive)
    const existing = existingCapabilities.find(
      (c) => c.name.toLowerCase() === newCap.name.toLowerCase()
    );

    if (existing) {
      // Use existing capability
      if (!existingIds.includes(existing.id)) {
        existingIds.push(existing.id);
      }
    } else {
      // Create new capability
      const { data: created, error: createError } = await supabase
        .from("company_capabilities_ref")
        .insert({
          name: newCap.name,
          category: newCap.category,
        })
        .select("id")
        .single();

      if (!createError && created) {
        createdIds.push((created as unknown as { id: string }).id);
      }
    }
  }

  // Combine existing and newly created IDs
  const allCapabilityIds = [...existingIds, ...createdIds];

  // Remove duplicates
  const uniqueIds = Array.from(new Set(allCapabilityIds));

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

  // Define base/generic categories for full regeneration mode
  // VERY BROAD, SIMPLE categories only - keep it minimal!
  const baseCategories = [
    "Construction",
    "Services",
    "ICT Process",
    "Design",
    "Manufacturing",
    "Engineering",
    "Healthcare",
    "Education",
    "Logistics",
    "Energy",
  ];

  // Fetch existing capabilities - show ALL capabilities so AI can see custom categories too
  // This prevents the AI from creating duplicate categories that already exist
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

  const regenerationMode = fullRegeneration 
    ? "FULL REGENERATION MODE: Prefer existing capabilities from the provided list. You CAN create new BROAD archetype categories (e.g., 'Healthcare', 'Environmental') if they don't exist, but NEVER create multiple specific categories for the same archetype. Keep capability names broad and generic."
    : "INCREMENTAL MODE: Review the company's current capabilities and make additions/removals as needed. You can create new broad categories when needed.";

  const systemPrompt = `You are an expert at analyzing companies. Generate BOTH a summary AND capability taxonomy in a single response.

${regenerationMode}

CRITICAL PRIORITY ORDER - READ CAREFULLY:

PRIORITY 1: ASSIGN TO EXISTING CATEGORIES AND CAPABILITIES
- FIRST: Review the provided capabilities list carefully
- ALWAYS try to assign the company to EXISTING categories and subcategories from the list
- Match company capabilities to existing items - even if the match isn't perfect, use the closest existing item
- ONLY create new categories/subcategories if absolutely necessary and no logical match exists

PRIORITY 2: IF NO EXISTING MATCH (only then):
- Create new BROAD archetype categories ONLY if truly needed (e.g., "Healthcare", "Environmental")
- NEVER create new categories if an existing one could work (e.g., use "Services" category instead of creating "Healthcare Services")
- Create new capability names that are BROAD and generic, not overly specific

UNDERSTAND THE HIERARCHY:
- CATEGORIES = BROAD ARCHETYPES (e.g., "Healthcare", "IT", "Environmental", "Construction", "Services")
- CAPABILITY NAMES = More specific items under a category (e.g., "Software Engineering" under "IT", "Services" under "Healthcare")

CATEGORY RULES:
1. FIRST PRIORITY: Use existing categories from the provided list - ALWAYS check if an existing category fits before creating new ones
2. SECOND PRIORITY: Only create new BROAD archetype categories if NO existing category is a logical match
3. NEVER create multiple specific categories for the same archetype:
   - BAD: "Healthcare Services", "Healthcare Equipment" as separate categories
   - GOOD: "Healthcare" as ONE category with capability names: "Services", "Equipment Supply"

CAPABILITY NAME RULES:
1. FIRST PRIORITY: ALWAYS prefer EXISTING capabilities from the provided list - assign companies to existing items
2. SECOND PRIORITY: Only create new capabilities if no existing one is a reasonable match
3. When creating new capabilities, keep names BROAD and generic:
   - GOOD: "Services", "Equipment Supply", "Software Engineering"
   - BAD: "Healthcare Compliance Services", "Healthcare Equipment Supply"
4. Select 2-5 capabilities - be conservative and prioritize existing ones

NEVER CREATE NEW ITEMS IF:
- An existing category/capability could reasonably represent the company's capabilities
- You haven't thoroughly checked the existing list for matches

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
2. "existing": Array of capability IDs (strings) from the provided list
3. "new": Array of objects with "name" and "category" for new capabilities not in the list

Example (copy this exact format, no comments):
{"summary": "Company summary text here...", "existing": ["capability-id-1", "capability-id-2"], "new": [{"name": "New Capability", "category": "Category Name"}]}`;

  const userPrompt = `Company Details:
Name: ${company.company_name || "N/A"}
Description: ${company.description || "N/A"}
${company.key_capabilities ? `Key Capabilities: ${company.key_capabilities}` : ""}
${company.certifications ? `Certifications: ${company.certifications}` : ""}
${company.equipment ? `Equipment: ${company.equipment}` : ""}
${company.past_projects ? `Past Projects: ${company.past_projects}` : ""}
${company.website_url ? `Website: ${company.website_url}` : ""}
${company.postcode ? `Location: ${company.postcode}` : ""}

Available Capabilities:
${capabilitiesList}

Generate a JSON object with:
- "summary": Professional 200-word company summary
- "existing": Array of relevant capability IDs from the list above
- "new": Array of new capabilities (if needed) with "name" and "category"

Return ONLY valid JSON (no comments, no explanations, no markdown).`;

  // Call OpenAI with rate limiting (single call for both tasks)
  const response = await runLLM(
    async () => {
      const aiResponse = await chatCompletion(systemPrompt, userPrompt, {
        model: "gpt-4o-mini",
        temperature: 0.3,
        maxTokens: 2500, // Slightly higher for combined output
      });
      return aiResponse;
    },
    3500 // Estimated tokens for combined request
  );

  // Parse AI response
  let summary = "";
  let existingIds: string[] = [];
  let newCapabilities: Array<{ name: string; category: string }> = [];

  try {
    const parsed = JSON.parse(response);
    summary = parsed.summary || "";
    existingIds = Array.isArray(parsed.existing) ? parsed.existing : [];
    newCapabilities = Array.isArray(parsed.new) ? parsed.new : [];
  } catch (e) {
    console.error("Failed to parse AI response for combined summary/taxonomy:", e);
    // Try to extract just summary if JSON parsing fails
    const summaryMatch = response.match(/"summary"\s*:\s*"([^"]+)"/);
    if (summaryMatch) {
      summary = summaryMatch[1];
    }
  }

  // Create new capabilities if needed
  const createdIds: string[] = [];
  for (const newCap of newCapabilities) {
    if (!newCap.name || !newCap.category) continue;

    const existing = existingCapabilities.find(
      (c) => c.name.toLowerCase() === newCap.name.toLowerCase()
    );

    if (existing) {
      if (!existingIds.includes(existing.id)) {
        existingIds.push(existing.id);
      }
    } else {
      // Create new capability
      const { data: created, error: createError } = await supabase
        .from("company_capabilities_ref")
        .insert({
          name: newCap.name,
          category: newCap.category,
        })
        .select("id")
        .single();

      if (!createError && created) {
        createdIds.push((created as unknown as { id: string }).id);
      }
    }
  }

  // Combine existing and newly created IDs
  const allCapabilityIds = [...existingIds, ...createdIds];
  const uniqueIds = Array.from(new Set(allCapabilityIds));

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
