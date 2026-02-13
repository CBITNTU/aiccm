import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  createAdminClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { existingCapabilitiesSchema } from "@/lib/schemas/capabilitySuggestion";
import { logApiEvent } from "@/lib/services/eventLogger";
import { z } from "zod";

const suggestCapabilitiesInputSchema = z.object({
  tenderId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return apiError("Unauthorized. Please log in to use this feature.", 401);
    }

    const body = await request.json();
    const parseResult = suggestCapabilitiesInputSchema.safeParse(body);

    if (!parseResult.success) {
      return apiError("Invalid request body", 400, parseResult.error.message);
    }

    const { tenderId } = parseResult.data;

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

    if (tenderError || !tender) {
      return apiError("Tender not found", 404);
    }

    // Fetch all available capabilities (public table, no RLS needed)
    const { data: capabilities, error: capabilitiesError } = await adminSupabase
      .from("company_capabilities_ref")
      .select("id, name, category")
      .order("category")
      .order("name");

    if (capabilitiesError || !capabilities) {
      return apiError("Failed to fetch capabilities", 500);
    }

    // Get capabilities that companies actually have
    const { data: companyCapabilityLinks } = await adminSupabase
      .from("company_capabilities")
      .select("capability_id")
      .limit(10000);

    const usedCapabilityIds = new Set(
      (companyCapabilityLinks || []).map(
        (link: { capability_id: string }) => link.capability_id,
      ),
    );

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

    const systemPrompt = `From the list below, pick capability names that match the tender. Prefer capabilities from the USED BY COMPANIES section. No new capabilities.`;

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

Prefer USED BY COMPANIES. Return existing = array of capability names from the list.`;

    const parsed = await aiGenerateObject({
      schema: existingCapabilitiesSchema,
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 8000,
    });

    const existingCapabilityNames = parsed.existing;

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

    await logApiEvent(request, {
      actionType: "tender_viewed",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "tender",
      entityId: tenderId,
      details: {
        suggestedCapabilitiesCount: prioritizedIds.length,
        totalCapabilities: capabilities.length,
      },
    }).catch(() => {});

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
