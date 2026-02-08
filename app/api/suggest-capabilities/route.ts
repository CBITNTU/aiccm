import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  createAdminClient,
  chatCompletion,
  apiResponse,
  apiError,
  parseAIJsonResponse,
} from "@/lib/api";
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
      .select(
        "title, description, buyer, budget_min, budget_max, deadline, location, cpv_codes",
      )
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

    // CRITICAL: Get capabilities that companies actually have (have links in junction table)
    // This ensures we only suggest capabilities that will find companies in Step 3
    const { data: companyCapabilityLinks } = await adminSupabase
      .from("company_capabilities")
      .select("capability_id")
      .limit(10000); // Get a sample to see which capabilities are used

    const usedCapabilityIds = new Set(
      (companyCapabilityLinks || []).map(
        (link: { capability_id: string }) => link.capability_id,
      ),
    );

    console.log(
      `📊 Found ${usedCapabilityIds.size} capabilities that companies actually have`,
    );
    console.log(`📊 Total capabilities in ref table: ${capabilities.length}`);

    // Format capabilities for AI
    const capabilitiesByCategory: Record<string, string[]> = {};
    capabilities.forEach((cap) => {
      const category = cap.category || "Uncategorized";
      if (!capabilitiesByCategory[category]) {
        capabilitiesByCategory[category] = [];
      }
      capabilitiesByCategory[category].push(cap.name);
    });

    // Separate capabilities into "used by companies" and "not used yet"
    const usedCapabilitiesByCategory: Record<string, string[]> = {};
    const unusedCapabilitiesByCategory: Record<string, string[]> = {};

    capabilities.forEach((cap) => {
      const category = cap.category || "Uncategorized";
      const isUsed = usedCapabilityIds.has(cap.id);

      if (isUsed) {
        if (!usedCapabilitiesByCategory[category]) {
          usedCapabilitiesByCategory[category] = [];
        }
        usedCapabilitiesByCategory[category].push(cap.name);
      } else {
        if (!unusedCapabilitiesByCategory[category]) {
          unusedCapabilitiesByCategory[category] = [];
        }
        unusedCapabilitiesByCategory[category].push(cap.name);
      }
    });

    // Format capabilities list - prioritize used capabilities
    const usedCapabilitiesList = Object.entries(usedCapabilitiesByCategory)
      .map(
        ([category, names]) =>
          `${category} (USED BY COMPANIES):\n  - ${names.join("\n  - ")}`,
      )
      .join("\n\n");

    const unusedCapabilitiesList = Object.entries(unusedCapabilitiesByCategory)
      .map(
        ([category, names]) =>
          `${category} (NOT YET USED):\n  - ${names.join("\n  - ")}`,
      )
      .join("\n\n");

    const capabilitiesList = `${usedCapabilitiesList}\n\n${unusedCapabilitiesList}`;

    // Create AI prompt (shortened for token savings)
    const systemPrompt = `From the list below, pick capability names that match the tender. Prefer capabilities from the USED BY COMPANIES section. Output JSON only: {"existing":["Name1","Name2"]}. No new capabilities.`;

    const budgetRange =
      tender.budget_min || tender.budget_max
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

Prefer USED BY COMPANIES. Return JSON: existing = array of capability names from the list.`;

    // Call OpenAI
    const response = await chatCompletion(systemPrompt, userPrompt, {
      maxTokens: 8000,
    });

    // Parse AI response - only existing capabilities, no new ones
    let existingCapabilityNames: string[] = [];

    try {
      // Use parseAIJsonResponse to handle comments
      const parsed = parseAIJsonResponse<{ existing?: string[] }>(response);
      existingCapabilityNames = Array.isArray(parsed.existing)
        ? parsed.existing
        : [];
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

    // Map capability names to IDs (only from static list)
    const suggestedCapabilityIds = existingCapabilityNames
      .map((name) => {
        const cap = capabilities.find(
          (c) => c.name.toLowerCase() === name.toLowerCase(),
        );
        return cap?.id;
      })
      .filter((id): id is string => id !== undefined);

    // Sort to prioritize used capabilities first
    const prioritizedIds = [
      ...suggestedCapabilityIds.filter((id) => usedCapabilityIds.has(id)),
      ...suggestedCapabilityIds.filter((id) => !usedCapabilityIds.has(id)),
    ];

    console.log(
      `📊 Final suggestion: ${prioritizedIds.filter((id) => usedCapabilityIds.has(id)).length} used capabilities, ${prioritizedIds.filter((id) => !usedCapabilityIds.has(id)).length} unused capabilities`,
    );

    // Log capability suggestion event
    await logApiEvent(request, {
      actionType: "tender_viewed", // User is viewing/analyzing tender
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "tender",
      entityId: tenderId,
      details: {
        suggestedCapabilitiesCount: prioritizedIds.length,
        totalCapabilities: capabilities.length,
      },
    }).catch(() => {}); // Don't fail if logging fails

    return apiResponse({
      suggestedCapabilityIds: prioritizedIds,
      suggestedCapabilityNames: existingCapabilityNames,
      totalCapabilities: capabilities.length,
      usedCapabilitiesCount: prioritizedIds.filter((id) =>
        usedCapabilityIds.has(id),
      ).length,
    });
  } catch (error) {
    console.error("Error suggesting capabilities:", error);
    return apiError(
      "Failed to suggest capabilities",
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
