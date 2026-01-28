import {
  createAdminClient,
  chatCompletion,
  parseAIJsonResponse,
} from "@/lib/api";
import { runLLM } from "./llmLimiter";

const supabase = createAdminClient();

/**
 * Generate AI summary for a tender
 */
export async function generateTenderSummary(tenderId: string): Promise<string> {
  // Fetch tender data
  const { data: tender, error } = await supabase
    .from("tenders")
    .select(
      "title, description, buyer, budget_min, budget_max, deadline, location, cpv_codes, requirements",
    )
    .eq("id", tenderId)
    .single();

  if (error || !tender) {
    throw new Error(
      `Failed to fetch tender: ${error?.message || "Tender not found"}`,
    );
  }

  // Format budget range
  const budgetRange =
    tender.budget_min || tender.budget_max
      ? `£${tender.budget_min ? tender.budget_min.toLocaleString() : "?"} - £${tender.budget_max ? tender.budget_max.toLocaleString() : "?"}`
      : "Not specified";

  // Format requirements if available
  const requirementsText = tender.requirements
    ? typeof tender.requirements === "string"
      ? tender.requirements
      : JSON.stringify(tender.requirements)
    : "";

  const systemPrompt = `You are an expert at analyzing tender opportunities. 
Generate a concise, professional 200-word summary of this tender opportunity.
Highlight:
- Key requirements and scope
- Budget range and timeline
- Ideal candidate profile
- Important deadlines and contact information
- Any special requirements or qualifications needed

Be specific and actionable.`;

  const userPrompt = `Tender Details:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${budgetRange}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpv_codes && tender.cpv_codes.length > 0 ? `CPV Codes: ${tender.cpv_codes.join(", ")}` : ""}
${requirementsText ? `Requirements: ${requirementsText}` : ""}

Generate a concise 200-word summary of this tender opportunity.`;

  // Call OpenAI with rate limiting
  const summary = await runLLM(
    async () => {
      const response = await chatCompletion(systemPrompt, userPrompt, {
        model: "gpt-5-nano",
        maxTokens: 1000,
      });
      return response;
    },
    2000, // Estimated tokens
  );

  // Store summary in database
  const { error: updateError } = await supabase
    .from("tenders" as any)
    .update({
      ai_summary: summary,
      summary_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", tenderId);

  if (updateError) {
    throw new Error(`Failed to store summary: ${updateError.message}`);
  }

  return summary;
}

/**
 * Generate capability taxonomy for a tender
 * Returns array of capability IDs and creates new capabilities if needed
 */
export async function generateTenderCapabilityTaxonomy(
  tenderId: string,
): Promise<string[]> {
  // Fetch tender data
  const { data: tender, error } = await supabase
    .from("tenders")
    .select(
      "title, description, buyer, budget_min, budget_max, deadline, location, cpv_codes, requirements",
    )
    .eq("id", tenderId)
    .single();

  if (error || !tender) {
    throw new Error(
      `Failed to fetch tender: ${error?.message || "Tender not found"}`,
    );
  }

  // Fetch existing capabilities
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

  const systemPrompt = `You are an expert at analyzing tenders and identifying required capabilities.
Your task is to analyze a tender and identify relevant capabilities.

CRITICAL FORMATTING RULES:
- Return ONLY valid JSON - nothing else
- NO comments (// or /* */) anywhere in the response
- NO explanations or text before or after the JSON
- NO markdown code blocks (no \`\`\`json\`\`\`)
- Start with { and end with }
- Use only double quotes for strings
- Do NOT add comments after values like "id", // comment

Return a JSON object with two arrays:
1. "existing": Array of capability IDs (strings) from the provided list that are relevant
2. "new": Array of objects with "name" and "category" for new capabilities not in the list

Example (copy this exact format, no comments):
{"existing": ["capability-id-1", "capability-id-2"], "new": [{"name": "New Capability", "category": "Category Name"}]}

Be selective - only include capabilities that are clearly needed or highly relevant.`;

  const userPrompt = `Tender Details:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${tender.budget_min || tender.budget_max ? `£${tender.budget_min?.toLocaleString() || "?"} - £${tender.budget_max?.toLocaleString() || "?"}` : "Not specified"}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpv_codes && tender.cpv_codes.length > 0 ? `CPV Codes: ${tender.cpv_codes.join(", ")}` : ""}
${tender.requirements ? `Requirements: ${typeof tender.requirements === "string" ? tender.requirements : JSON.stringify(tender.requirements)}` : ""}

Available Capabilities:
${capabilitiesList}

Analyze this tender and return ONLY a valid JSON object (no comments, no explanations, no markdown) with relevant capability IDs and any new capabilities needed.`;

  // Call OpenAI with rate limiting
  const response = await runLLM(
    async () => {
      const aiResponse = await chatCompletion(systemPrompt, userPrompt, {
        model: "gpt-5-nano",
        maxTokens: 3000,
      });
      return aiResponse;
    },
    3000, // Estimated tokens
  );

  // Parse AI response using the global parser (handles comments automatically)
  let existingIds: string[] = [];
  let newCapabilities: Array<{ name: string; category: string }> = [];

  try {
    // Use the global parseAIJsonResponse which handles comments
    const parsed = parseAIJsonResponse<{
      existing?: string[];
      new?: Array<{ name: string; category: string }>;
    }>(response);
    existingIds = Array.isArray(parsed.existing) ? parsed.existing : [];
    newCapabilities = Array.isArray(parsed.new) ? parsed.new : [];
  } catch (e) {
    console.error("Failed to parse AI response for capabilities:", e);
    console.error("Response was:", response.substring(0, 500));
    // Try to extract just the existing IDs if new format fails
    try {
      const arrayMatch = response.match(/\[[\s\S]*?\]/);
      if (arrayMatch) {
        const parsedArray = parseAIJsonResponse<string[]>(arrayMatch[0]);
        existingIds = Array.isArray(parsedArray) ? parsedArray : [];
      }
    } catch (e2) {
      console.error("Failed to parse as array too:", e2);
      // Return empty arrays if all parsing fails
      existingIds = [];
      newCapabilities = [];
    }
  }

  // Create new capabilities and remove duplicates
  const createdIds: string[] = [];
  for (const newCap of newCapabilities) {
    if (!newCap.name || !newCap.category) continue;

    // Check if capability already exists (case-insensitive)
    const existing = existingCapabilities.find(
      (c) => c.name.toLowerCase() === newCap.name.toLowerCase(),
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
  const { error: updateError } = await supabase
    .from("tenders" as any)
    .update({
      ai_capability_taxonomy: uniqueIds,
      taxonomy_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", tenderId);

  if (updateError) {
    throw new Error(`Failed to store taxonomy: ${updateError.message}`);
  }

  return uniqueIds;
}
