import { NextRequest } from "next/server";
import { createAdminClient, apiResponse } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { companyAnalysisSchema } from "@/lib/schemas/companyAnalysis";
import { logApiEvent } from "@/lib/services/eventLogger";
import { z } from "zod";
import {
  requireAuth,
  validateBody,
  handleApiError,
  isCompanyMember,
} from "@/lib/api/validation";

const analyzeCompanyAIInputSchema = z.object({
  companyData: z.object({
    companyName: z.string().min(1).max(200),
    websiteUrl: z.string().max(500).optional(),
    description: z.string().max(5000).optional(),
    keyCapabilities: z.string().max(5000).optional(),
    certifications: z.string().max(2000).optional(),
    equipment: z.string().max(2000).optional(),
    pastProjects: z.string().max(5000).optional(),
  }),
  companyId: z.string().uuid().optional(),
});

function buildCompanyAnalysisPrompt(
  companyData: z.infer<typeof analyzeCompanyAIInputSchema>["companyData"],
  taxonomyList: string,
): string {
  return `Assess this company. Fill the JSON: competencies, capabilities, strengths, certifications, recommendations, digitalMaturity, safetyRating, marketPosition, suggestedTaxonomies (from available list). UK/tender focus.

Company Name: ${companyData.companyName}
Website: ${companyData.websiteUrl || "Not provided"}
Description: ${companyData.description || "Not provided"}
Key Capabilities: ${companyData.keyCapabilities || "Not provided"}
Certifications: ${companyData.certifications || "Not provided"}
Equipment: ${companyData.equipment || "Not provided"}
Past Projects: ${companyData.pastProjects || "Not provided"}

Available taxonomy categories: ${taxonomyList}`;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const { companyData, companyId } = await validateBody(
      request,
      analyzeCompanyAIInputSchema,
    );

    const supabase = createAdminClient();

    // If companyId provided, verify user is owner or approved team member
    if (companyId) {
      const hasAccess = await isCompanyMember(user.id, companyId);
      if (!hasAccess) {
        return apiResponse({ error: "Not authorized for this company" }, 403);
      }
    }

    // Fetch available taxonomies
    const { data: taxonomies } = await supabase
      .from("taxonomies")
      .select("id, name, level")
      .order("level");

    const taxonomyList =
      taxonomies?.map((t) => `${t.name} (Level ${t.level})`).join(", ") || "";

    const prompt = buildCompanyAnalysisPrompt(companyData, taxonomyList);

    const parsedResult = await aiGenerateObject({
      schema: companyAnalysisSchema,
      system:
        "You are an expert industry analyst specializing in UK market competency assessment and tender evaluation.",
      prompt,
      temperature: 0.3,
      maxTokens: 5000,
    });

    // Auto-tag company with suggested taxonomies
    if (
      companyId &&
      parsedResult.suggestedTaxonomies &&
      parsedResult.suggestedTaxonomies.length > 0 &&
      taxonomies
    ) {
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
        await supabase
          .from("company_taxonomies")
          .delete()
          .eq("company_id", companyId);

        const taxonomyInserts = taxonomyIds.map((taxId) => ({
          company_id: companyId,
          taxonomy_id: taxId,
        }));

        await supabase.from("company_taxonomies").insert(taxonomyInserts);
      }
    }

    await logApiEvent(request, {
      actionType: "company_capabilities_updated",
      userId: user.id,
      entityType: "company",
      entityId: companyId || undefined,
      details: { company_name: companyData.companyName },
    }).catch(() => {});

    return apiResponse({ analysis: parsedResult });
  } catch (error) {
    return handleApiError(error);
  }
}
