import { NextRequest } from "next/server";
import {
  createAdminClient,
  createApiClient,
  chatCompletion,
  parseAIJsonResponse,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import type { CompanyAnalysis } from "@/lib/api/types";

interface CompanyData {
  companyName: string;
  websiteUrl?: string;
  description?: string;
  keyCapabilities?: string;
  certifications?: string;
  equipment?: string;
  pastProjects?: string;
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

    const { companyData, companyId } = (await request.json()) as {
      companyData: CompanyData;
      companyId?: string;
    };

    if (!companyData || !companyData.companyName) {
      return apiError("companyData with companyName is required", 400);
    }

    const supabase = createAdminClient();

    // Fetch available taxonomies to help AI suggest appropriate ones
    const { data: taxonomies } = await supabase
      .from("taxonomies")
      .select("id, name, level")
      .order("level");

    const taxonomyList =
      taxonomies?.map((t) => `${t.name} (Level ${t.level})`).join(", ") || "";

    const prompt = `Assess this company. Fill the JSON: competencies, capabilities, strengths, certifications, recommendations, digitalMaturity, safetyRating, marketPosition, suggestedTaxonomies (from available list). UK/tender focus.

Company Name: ${companyData.companyName}
Website: ${companyData.websiteUrl || "Not provided"}
Description: ${companyData.description || "Not provided"}
Key Capabilities: ${companyData.keyCapabilities || "Not provided"}
Certifications: ${companyData.certifications || "Not provided"}
Equipment: ${companyData.equipment || "Not provided"}
Past Projects: ${companyData.pastProjects || "Not provided"}

Available taxonomy categories: ${taxonomyList}

JSON format:
{
  "competencies": ["list of extracted competencies"],
  "capabilities": ["specific technical capabilities"],
  "strengths": ["key competitive strengths"],
  "certifications": ["standardized certification list"],
  "recommendations": ["improvement recommendations"],
  "digitalMaturity": "assessment of digital capabilities",
  "safetyRating": "safety and compliance assessment",
  "marketPosition": "market positioning analysis",
  "suggestedTaxonomies": ["array of taxonomy names from the available list that best match this company's profile"]
}`;

    console.log("Sending request to OpenAI...");

    const systemPrompt =
      "You are an expert industry analyst specializing in UK market competency assessment and tender evaluation. Return valid JSON only. No markdown.";

    const response = await chatCompletion(systemPrompt, prompt, {
      temperature: 0.3,
      maxTokens: 5000,
    });

    console.log("OpenAI response received");

    // Parse JSON response with improved error handling
    let parsedResult: CompanyAnalysis;
    try {
      parsedResult = parseAIJsonResponse<CompanyAnalysis>(response);
    } catch (e) {
      console.warn("Failed to parse OpenAI response, using defaults:", e);
      parsedResult = {
        competencies: ["General Construction"],
        capabilities: ["Basic Construction Services"],
        strengths: ["Experience in Construction"],
        certifications: [],
        recommendations: ["Consider obtaining relevant certifications"],
        digitalMaturity: "Requires assessment",
        safetyRating: "Requires assessment",
        marketPosition: "Requires further analysis",
        suggestedTaxonomies: [],
      };
    }

    // Auto-tag company with suggested taxonomies
    if (
      companyId &&
      parsedResult.suggestedTaxonomies &&
      parsedResult.suggestedTaxonomies.length > 0 &&
      taxonomies
    ) {
      console.log(
        "Auto-tagging company with taxonomies:",
        parsedResult.suggestedTaxonomies,
      );

      // Find taxonomy IDs by name
      const taxonomyIds = taxonomies
        .filter((t) =>
          parsedResult.suggestedTaxonomies?.some(
            (suggested) =>
              t.name.toLowerCase().includes(suggested.toLowerCase()) ||
              suggested.toLowerCase().includes(t.name.toLowerCase()),
          ),
        )
        .map((t) => t.id);

      if (taxonomyIds.length > 0) {
        // Remove existing taxonomies first to avoid duplicates
        await supabase
          .from("company_taxonomies")
          .delete()
          .eq("company_id", companyId);

        // Insert new taxonomies
        const taxonomyInserts = taxonomyIds.map((taxId) => ({
          company_id: companyId,
          taxonomy_id: taxId,
        }));

        const { error: taxonomyError } = await supabase
          .from("company_taxonomies")
          .insert(taxonomyInserts);

        if (taxonomyError) {
          console.error("Error inserting taxonomies:", taxonomyError);
        } else {
          console.log(
            `Successfully tagged company with ${taxonomyIds.length} taxonomies`,
          );
        }
      }
    }

    await logApiEvent(request, {
      actionType: "company_capabilities_updated",
      userId: userId || undefined,
      entityType: "company",
      entityId: companyId || undefined,
      details: { company_name: companyData.companyName },
    }).catch(() => {});

    return apiResponse({ analysis: parsedResult });
  } catch (error) {
    console.error("Error in analyze-company-ai:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(
      "Failed to analyze company profile. Please try again.",
      500,
      message,
    );
  }
}
