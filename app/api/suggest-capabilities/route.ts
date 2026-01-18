import { NextRequest } from "next/server";
import { getAuthenticatedUser, createAdminClient, chatCompletion, apiResponse, apiError, parseAIJsonResponse } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

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
Your task is to analyze a tender description and identify relevant capabilities.

CRITICAL FORMATTING RULES:
- Return ONLY valid JSON - nothing else
- NO comments (// or /* */) anywhere in the response
- NO explanations or text before or after the JSON
- NO markdown code blocks (no \`\`\`json\`\`\`)
- Start with { and end with }
- Use only double quotes for strings

Return a JSON object with two arrays:
1. "existing": Array of capability names (strings) from the provided list that are relevant
2. "new": Array of objects with "name" and "category" for new capabilities not in the list that are needed

Example (copy this exact format, no comments):
{"existing": ["Capability Name 1", "Capability Name 2"], "new": [{"name": "New Capability", "category": "Category Name"}]}

Be selective - only include capabilities that are clearly needed or highly relevant.`;

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

Based on the tender details above, return ONLY a valid JSON object (no comments, no explanations, no markdown) with:
- "existing": Array of capability names from the provided list that match
- "new": Array of new capabilities with "name" and "category" if the tender requires capabilities not in the list

Example format:
{"existing": ["Construction", "Project Management"], "new": [{"name": "Bridge Engineering", "category": "Construction"}]}`;

    // Call OpenAI
    const response = await chatCompletion(systemPrompt, userPrompt, {
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1000,
    });

    // Parse AI response
    let existingCapabilityNames: string[] = [];
    let newCapabilities: Array<{ name: string; category: string }> = [];
    
    try {
      // Use parseAIJsonResponse to handle comments
      const parsed = parseAIJsonResponse<{ existing?: string[]; new?: Array<{ name: string; category: string }> }>(response);
      existingCapabilityNames = Array.isArray(parsed.existing) ? parsed.existing : [];
      newCapabilities = Array.isArray(parsed.new) ? parsed.new : [];
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      // Fallback: try to extract just existing names as array
      try {
        const arrayMatch = response.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          existingCapabilityNames = JSON.parse(arrayMatch[0]);
        }
      } catch (e2) {
        console.error("Failed to parse as array too:", e2);
      }
    }

    // Create new capabilities if needed
    const createdCapabilityIds: string[] = [];
    for (const newCap of newCapabilities) {
      if (!newCap.name || !newCap.category) continue;

      // Check if capability already exists (case-insensitive)
      const existing = capabilities.find(
        (c) => c.name.toLowerCase() === newCap.name.toLowerCase()
      );

      if (existing) {
        // Use existing capability - add to existing list if not already there
        if (!existingCapabilityNames.find(n => n.toLowerCase() === existing.name.toLowerCase())) {
          existingCapabilityNames.push(existing.name);
        }
      } else {
        // Create new capability
        const { data: created, error: createError } = await adminSupabase
          .from("company_capabilities_ref")
          .insert({
            name: newCap.name,
            category: newCap.category,
            // New capabilities are created without is_active dependency
          })
          .select("id")
          .single();

        if (!createError && created) {
          const newId = (created as unknown as { id: string }).id;
          createdCapabilityIds.push(newId);
          // Also add to existing list so it gets returned
          existingCapabilityNames.push(newCap.name);
        } else {
          console.error("Failed to create new capability:", createError);
        }
      }
    }

    // Map capability names to IDs (for existing capabilities)
    const suggestedCapabilityIds = existingCapabilityNames
      .map((name) => {
        const cap = capabilities.find(
          (c) => c.name.toLowerCase() === name.toLowerCase()
        );
        return cap?.id;
      })
      .filter((id): id is string => id !== undefined);

    // Combine existing and newly created IDs
    const allCapabilityIds = [...suggestedCapabilityIds, ...createdCapabilityIds];

    // Log capability suggestion event
    await logApiEvent(request, {
      actionType: "tender_viewed", // User is viewing/analyzing tender
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "tender",
      entityId: tenderId,
      details: {
        suggestedCapabilitiesCount: suggestedCapabilityIds.length,
        totalCapabilities: capabilities.length,
      },
    }).catch(() => {}); // Don't fail if logging fails

    return apiResponse({
      suggestedCapabilityIds: allCapabilityIds,
      suggestedCapabilityNames: existingCapabilityNames,
      newCapabilitiesCreated: newCapabilities.length,
      totalCapabilities: capabilities.length + createdCapabilityIds.length,
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
