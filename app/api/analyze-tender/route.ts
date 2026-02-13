import { NextRequest } from "next/server";
import {
  createAdminClient,
  createApiClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { z } from "zod";
import { logApiEvent } from "@/lib/services/eventLogger";

const tenderTaxonomySuggestionSchema = z.object({
  taxonomies: z
    .array(z.string())
    .describe("Array of taxonomy category names that best match this tender"),
});

interface TenderData {
  title: string;
  description?: string;
  buyer: string;
  cpv_codes?: string[];
  location?: string;
}

export async function POST(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      const supabaseAuth = await createApiClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      userId = user?.id;
    } catch {
      // Optional auth
    }

    const { tenderData, tenderId } = (await request.json()) as {
      tenderData: TenderData;
      tenderId?: string;
    };

    if (!tenderData || !tenderData.title) {
      return apiError("tenderData with title is required", 400);
    }

    const supabase = createAdminClient();

    // Fetch available taxonomies
    const { data: taxonomies } = await supabase
      .from("taxonomies")
      .select("id, name, level")
      .order("level");

    const taxonomyList =
      taxonomies?.map((t) => `${t.name} (Level ${t.level})`).join(", ") || "";

    const prompt = `Tender Title: ${tenderData.title}
Description: ${tenderData.description || "Not provided"}
Buyer: ${tenderData.buyer}
${tenderData.cpv_codes ? `CPV Codes: ${tenderData.cpv_codes.join(", ")}` : ""}
${tenderData.location ? `Location: ${tenderData.location}` : ""}

Available taxonomy categories: ${taxonomyList}

Pick 2-5 categories that best match this tender. Focus on the most specific categories.`;

    console.log("Analyzing tender:", tenderData.title);

    const systemPrompt =
      "You are an expert at analyzing tender documents and categorizing them.";

    const parsed = await aiGenerateObject({
      schema: tenderTaxonomySuggestionSchema,
      system: systemPrompt,
      prompt,
      temperature: 0.2,
      maxTokens: 10000,
    });

    const suggestedTaxonomies = parsed.taxonomies;

    console.log("AI suggested taxonomies:", suggestedTaxonomies);

    // Auto-tag tender if tenderId provided
    if (tenderId && suggestedTaxonomies.length > 0 && taxonomies) {
      console.log("Auto-tagging tender with taxonomies:", suggestedTaxonomies);

      const taxonomyIds = taxonomies
        .filter((t) =>
          suggestedTaxonomies.some(
            (suggested) =>
              t.name.toLowerCase().includes(suggested.toLowerCase()) ||
              suggested.toLowerCase().includes(t.name.toLowerCase()),
          ),
        )
        .map((t) => t.id);

      if (taxonomyIds.length > 0) {
        // Remove existing taxonomies
        await supabase
          .from("tender_taxonomies")
          .delete()
          .eq("tender_id", tenderId);

        // Insert new taxonomies
        const taxonomyInserts = taxonomyIds.map((taxId) => ({
          tender_id: tenderId,
          taxonomy_id: taxId,
        }));

        const { error: taxonomyError } = await supabase
          .from("tender_taxonomies")
          .insert(taxonomyInserts);

        if (taxonomyError) {
          console.error("Error inserting tender taxonomies:", taxonomyError);
        } else {
          console.log(
            `Successfully tagged tender with ${taxonomyIds.length} taxonomies`,
          );
        }
      }
    }

    await logApiEvent(request, {
      actionType: "tender_analyzed",
      userId: userId || undefined,
      entityType: "tender",
      entityId: tenderId || undefined,
      details: {
        title: tenderData.title,
        taxonomyCount: suggestedTaxonomies.length,
      },
    }).catch(() => {});

    return apiResponse({
      suggestedTaxonomies,
      taxonomyCount: suggestedTaxonomies.length,
    });
  } catch (error) {
    console.error("Error in analyze-tender:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError("Failed to analyze tender", 500, message);
  }
}
