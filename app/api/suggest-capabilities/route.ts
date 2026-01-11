import { NextRequest } from "next/server";
import { getAuthenticatedUser, createAdminClient, chatCompletion, apiResponse, apiError } from "@/lib/api";

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      console.error("Authentication error in suggest-capabilities:", authError);
      return apiError("Unauthorized. Please log in to use this feature.", 401);
    }

    const { tenderId } = await request.json();

    if (!tenderId) {
      return apiError("Tender ID is required", 400);
    }

    console.log("Fetching tender for capability suggestions:", tenderId);

    // Use admin client to bypass RLS for reading tender (user is already authenticated)
    const adminSupabase = createAdminClient();

    // Fetch tender details
    const { data: tender, error: tenderError } = await adminSupabase
      .from("tenders")
      .select("title, description, buyer, budget_min, budget_max, deadline, location, cpv_codes")
      .eq("id", tenderId)
      .single();

    if (tenderError) {
      console.error("Error fetching tender:", tenderError);
      return apiError(`Tender not found: ${tenderError.message}`, 404);
    }

    if (!tender) {
      console.error("Tender not found, ID:", tenderId);
      return apiError("Tender not found", 404);
    }

    console.log("Tender found:", tender.title);

    // Fetch all available capabilities (public table, no RLS needed)
    const { data: capabilities, error: capabilitiesError } = await adminSupabase
      .from("company_capabilities_ref")
      .select("id, name, category")
      .order("category")
      .order("name");

    if (capabilitiesError || !capabilities) {
      return apiError("Failed to fetch capabilities", 500);
    }

    // Format capabilities for AI
    const capabilitiesByCategory: Record<string, string[]> = {};
    capabilities.forEach((cap) => {
      const category = cap.category || "Uncategorized";
      if (!capabilitiesByCategory[category]) {
        capabilitiesByCategory[category] = [];
      }
      capabilitiesByCategory[category].push(cap.name);
    });

    const capabilitiesList = Object.entries(capabilitiesByCategory)
      .map(([category, names]) => `${category}:\n  - ${names.join("\n  - ")}`)
      .join("\n\n");

    // Create AI prompt
    const systemPrompt = `You are an expert at analyzing tenders and identifying required capabilities. 
Your task is to analyze a tender description and select the most relevant capabilities from a provided list.

Return ONLY a JSON array of capability names (strings) that are relevant for this tender.
Be selective - only include capabilities that are clearly needed or highly relevant.
Return an empty array if no capabilities are clearly relevant.`;

    // Format budget range
    const budgetRange = tender.budget_min || tender.budget_max
      ? `£${tender.budget_min ? tender.budget_min.toLocaleString() : "?"} - £${tender.budget_max ? tender.budget_max.toLocaleString() : "?"}`
      : "Not specified";

    const userPrompt = `Tender Details:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${budgetRange}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpv_codes && tender.cpv_codes.length > 0 ? `CPV Codes: ${tender.cpv_codes.join(", ")}` : ""}

Available Capabilities:
${capabilitiesList}

Based on the tender details above, return a JSON array of capability names that are relevant for this tender. 
Only include capabilities that are clearly needed based on the tender description.
Return the array in this exact format: ["Capability Name 1", "Capability Name 2", ...]`;

    // Call OpenAI
    const response = await chatCompletion(systemPrompt, userPrompt, {
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1000,
    });

    // Parse AI response
    let suggestedCapabilityNames: string[] = [];
    try {
      // Try to extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        suggestedCapabilityNames = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      // Return empty array if parsing fails
    }

    // Map capability names to IDs
    const suggestedCapabilityIds = suggestedCapabilityNames
      .map((name) => {
        const cap = capabilities.find(
          (c) => c.name.toLowerCase() === name.toLowerCase()
        );
        return cap?.id;
      })
      .filter((id): id is string => id !== undefined);

    return apiResponse({
      suggestedCapabilityIds,
      suggestedCapabilityNames,
      totalCapabilities: capabilities.length,
    });
  } catch (error) {
    console.error("Error suggesting capabilities:", error);
    return apiError(
      "Failed to suggest capabilities",
      500,
      error instanceof Error ? error.message : String(error)
    );
  }
}
