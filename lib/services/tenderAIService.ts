/* eslint-disable @typescript-eslint/no-explicit-any -- tenders, profiles extended columns */
import { createAdminClient } from "@/lib/api";
import { aiGenerateText, aiGenerateObject } from "@/lib/ai";
import {
  tenderCapabilitiesSchema,
  tenderSummaryAndTaxonomySchema,
} from "@/lib/schemas/capabilitySuggestion";

const TENDER_SELECT =
  "title, description, buyer, budget_min, budget_max, deadline, location, cpv_codes, requirements";

const supabase = createAdminClient();

/**
 * Generate AI summary for a tender
 */
export async function generateTenderSummary(tenderId: string): Promise<string> {
  const { data: tender, error } = await supabase
    .from("tenders")
    .select(TENDER_SELECT)
    .eq("id", tenderId)
    .single();

  if (error || !tender) {
    throw new Error(
      `Failed to fetch tender: ${error?.message || "Tender not found"}`,
    );
  }

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

  const systemPrompt = `Generate a 200-word summary covering: requirements/scope, budget/timeline, ideal candidate, deadlines/contact, special requirements. Be specific and actionable.`;

  const userPrompt = `Tender Details:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${budgetRange}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpv_codes && tender.cpv_codes.length > 0 ? `CPV Codes: ${tender.cpv_codes.join(", ")}` : ""}
${requirementsText ? `Requirements: ${requirementsText}` : ""}

Summarize.`;

  const summary = await aiGenerateText({
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 1000,
    estTokens: 2000,
  });

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
  const { data: tender, error } = await supabase
    .from("tenders")
    .select(TENDER_SELECT)
    .eq("id", tenderId)
    .single();

  if (error || !tender) {
    throw new Error(
      `Failed to fetch tender: ${error?.message || "Tender not found"}`,
    );
  }

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

  const systemPrompt = `Be selective - only capabilities clearly needed or highly relevant. Return existing IDs from the list, and new capabilities with name and category.`;

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

Return existing (IDs from list) and new (name, category).`;

  const parsed = await aiGenerateObject({
    schema: tenderCapabilitiesSchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 3000,
    estTokens: 3000,
  });

  const existingIds = parsed.existing;
  const newCapabilities = parsed.new;

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

/**
 * Generate tender summary and capability taxonomy in a single AI call (fewer API calls).
 */
export async function generateTenderSummaryAndTaxonomy(
  tenderId: string,
): Promise<{ summary: string; taxonomy: string[] }> {
  const { data: tender, error } = await supabase
    .from("tenders")
    .select(TENDER_SELECT)
    .eq("id", tenderId)
    .single();

  if (error || !tender) {
    throw new Error(
      `Failed to fetch tender: ${error?.message || "Tender not found"}`,
    );
  }

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

  const capabilitiesByCategory: Record<
    string,
    Array<{ id: string; name: string }>
  > = {};
  existingCapabilities.forEach(
    (cap: { id: string; name: string; category: string | null }) => {
      const category = cap.category || "Uncategorized";
      if (!capabilitiesByCategory[category])
        capabilitiesByCategory[category] = [];
      capabilitiesByCategory[category].push({ id: cap.id, name: cap.name });
    },
  );
  const capabilitiesList = Object.entries(capabilitiesByCategory)
    .map(
      ([cat, caps]) =>
        `${cat}:\n  ${caps.map((c) => `- ${c.name} (ID: ${c.id})`).join("\n  ")}`,
    )
    .join("\n\n");

  const budgetRange =
    tender.budget_min || tender.budget_max
      ? `£${tender.budget_min ? tender.budget_min.toLocaleString() : "?"} - £${tender.budget_max ? tender.budget_max.toLocaleString() : "?"}`
      : "Not specified";
  const requirementsText = tender.requirements
    ? typeof tender.requirements === "string"
      ? tender.requirements
      : JSON.stringify(tender.requirements)
    : "";

  const systemPrompt = `You are an expert at analyzing tenders. Provide:
1. "summary": A concise 200-word professional summary (key requirements, scope, budget, timeline, ideal candidate).
2. "existing": Array of capability IDs (strings) from the provided list that are relevant.
3. "new": Array of objects with "name" and "category" for new capabilities not in the list.`;

  const userPrompt = `Tender:
Title: ${tender.title || "N/A"}
Description: ${tender.description || "N/A"}
Buyer: ${tender.buyer || "N/A"}
Budget: ${budgetRange}
Deadline: ${tender.deadline || "N/A"}
Location: ${tender.location || "N/A"}
${tender.cpv_codes?.length ? `CPV: ${tender.cpv_codes.join(", ")}` : ""}
${requirementsText ? `Requirements: ${requirementsText}` : ""}

Available capabilities:
${capabilitiesList}

Return one object with summary, existing (IDs), and new (name/category).`;

  const parsed = await aiGenerateObject({
    schema: tenderSummaryAndTaxonomySchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 2500,
    estTokens: 3500,
  });

  const summary = parsed.summary;
  const existingIds = parsed.existing;
  const newCapabilities = parsed.new;

  const createdIds: string[] = [];
  for (const newCap of newCapabilities) {
    if (!newCap.name || !newCap.category) continue;
    const existing = existingCapabilities.find(
      (c: { name: string }) =>
        c.name.toLowerCase() === newCap.name.toLowerCase(),
    );
    if (existing) {
      if (!existingIds.includes((existing as { id: string }).id)) {
        existingIds.push((existing as { id: string }).id);
      }
    } else {
      const { data: created } = await supabase
        .from("company_capabilities_ref")
        .insert({ name: newCap.name, category: newCap.category })
        .select("id")
        .single();
      if (created) createdIds.push((created as unknown as { id: string }).id);
    }
  }
  const uniqueIds = Array.from(new Set([...existingIds, ...createdIds]));

  const { error: updateError } = await supabase
    .from("tenders" as any)
    .update({
      ai_summary: summary,
      summary_generated_at: new Date().toISOString(),
      ai_capability_taxonomy: uniqueIds,
      taxonomy_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", tenderId);

  if (updateError) {
    throw new Error(`Failed to store tender AI: ${updateError.message}`);
  }

  return { summary, taxonomy: uniqueIds };
}
