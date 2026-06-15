import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  apiResponse,
  apiError,
} from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { existingCapabilitiesSchema } from "@/lib/schemas/capabilitySuggestion";
import { logApiEvent } from "@/lib/services/eventLogger";
import { z } from "zod";
import { db } from "@/lib/db";
import { tenders, companyCapabilities } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";
import { getCapabilityCatalog } from "@/lib/services/capabilityCatalog";

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

    // Fetch tender details
    const tenderRows = await db
      .select({
        title: tenders.title,
        description: tenders.description,
        buyer: tenders.buyer,
        budgetMin: tenders.budgetMin,
        budgetMax: tenders.budgetMax,
        deadline: tenders.deadline,
        location: tenders.location,
        cpvCodes: tenders.cpvCodes,
      })
      .from(tenders)
      .where(eq(tenders.id, tenderId))
      .limit(1);

    const tender = tenderRows[0];
    if (!tender) {
      return apiError("Tender not found", 404);
    }

    // Fetch all available capabilities (cached in-process catalog)
    const capabilities = await getCapabilityCatalog();

    if (!capabilities || capabilities.length === 0) {
      return apiError("Failed to fetch capabilities", 500);
    }

    // Get capabilities that companies actually have
    const companyCapabilityLinks = await db
      .select({ capabilityId: companyCapabilities.capabilityId })
      .from(companyCapabilities)
      .limit(10000);

    const usedCapabilityIds = new Set(
      companyCapabilityLinks.map((link) => link.capabilityId),
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
      tender.budgetMin || tender.budgetMax
        ? `\u00A3${tender.budgetMin ? tender.budgetMin.toLocaleString() : "?"} - \u00A3${tender.budgetMax ? tender.budgetMax.toLocaleString() : "?"}`
        : "Not specified";

    const userPrompt = `Tender Details:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${budgetRange}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpvCodes && tender.cpvCodes.length > 0 ? `CPV Codes: ${tender.cpvCodes.join(", ")}` : ""}

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
