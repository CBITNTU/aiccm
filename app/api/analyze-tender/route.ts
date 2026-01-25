import { NextRequest } from "next/server";
import {
  createAdminClient,
  chatCompletion,
  parseAIJsonResponse,
  apiResponse,
  apiError,
} from "@/lib/api";

interface TenderData {
  title: string;
  description?: string;
  buyer: string;
  cpv_codes?: string[];
  location?: string;
}

export async function POST(request: NextRequest) {
  try {
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

    const prompt = `Analyze this tender and identify the most relevant industry categories from the available taxonomy list:

Tender Title: ${tenderData.title}
Description: ${tenderData.description || "Not provided"}
Buyer: ${tenderData.buyer}
${tenderData.cpv_codes ? `CPV Codes: ${tenderData.cpv_codes.join(", ")}` : ""}
${tenderData.location ? `Location: ${tenderData.location}` : ""}

Available taxonomy categories: ${taxonomyList}

Please analyze the tender and return ONLY a JSON array of the most relevant taxonomy names from the available list. Select 2-5 categories that best match this tender's scope and requirements.

Return format (must be valid JSON array):
["Category Name 1", "Category Name 2", "Category Name 3"]

Focus on the most specific and accurate categories that would help companies find this tender.`;

    console.log("Analyzing tender:", tenderData.title);

    const systemPrompt =
      "You are an expert at analyzing tender documents and categorizing them. Return only valid JSON arrays of category names.";

    const response = await chatCompletion(systemPrompt, prompt, {
      temperature: 0.2,
      maxTokens: 5000,
    });

    console.log("AI response:", response);

    let suggestedTaxonomies: string[] = [];
    try {
      suggestedTaxonomies = parseAIJsonResponse<string[]>(response);
    } catch (e) {
      console.error("Failed to parse AI response:", response, e);
      suggestedTaxonomies = [];
    }

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
