import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { companyAnalysisSchema } from "@/lib/schemas/companyAnalysis";
import { logApiEvent } from "@/lib/services/eventLogger";
import { refreshCompanyEmbedding } from "@/lib/services/embeddingService";
import { z } from "zod";
import {
  requireAuth,
  validateBody,
  handleApiError,
  isCompanyMember,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { taxonomies, companyTaxonomies, companies } from "@/lib/db/schema/app";
import { eq, asc } from "drizzle-orm";

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

    // If companyId provided, verify user is owner or approved team member
    if (companyId) {
      const hasAccess = await isCompanyMember(user.id, companyId);
      if (!hasAccess) {
        return apiResponse({ error: "Not authorized for this company" }, 403);
      }
    }

    console.log("[CompanyAI:analyze-ai] Input companyData —", {
      companyName: companyData.companyName,
      hasWebsiteUrl: !!companyData.websiteUrl,
      hasDescription: !!companyData.description,
      hasKeyCapabilities: !!companyData.keyCapabilities,
      hasCertifications: !!companyData.certifications,
      hasEquipment: !!companyData.equipment,
      hasPastProjects: !!companyData.pastProjects,
      companyId: companyId || "none",
    });

    // Fetch available taxonomies
    const taxonomyRows = await db
      .select({ id: taxonomies.id, name: taxonomies.name, level: taxonomies.level })
      .from(taxonomies)
      .orderBy(asc(taxonomies.level));

    const taxonomyList =
      taxonomyRows.map((t) => `${t.name} (Level ${t.level})`).join(", ") || "";

    console.log("[CompanyAI:analyze-ai] Taxonomies — count:", taxonomyRows.length, "list:", taxonomyList.substring(0, 300));

    const prompt = buildCompanyAnalysisPrompt(companyData, taxonomyList);
    console.log("[CompanyAI:analyze-ai] Prompt —", prompt);

    const parsedResult = await aiGenerateObject({
      schema: companyAnalysisSchema,
      system:
        "You are an expert industry analyst specializing in UK market competency assessment and tender evaluation.",
      prompt,
      temperature: 0.3,
      maxTokens: 5000,
    });

    console.log("[CompanyAI:analyze-ai] AI response —", JSON.stringify(parsedResult, null, 2));

    // Save AI analysis results to the companies table
    if (companyId) {
      const savePayload = {
        aiCompetencies: parsedResult.competencies,
        aiCapabilities: parsedResult.capabilities,
        aiStrengths: parsedResult.strengths,
        aiCertifications: parsedResult.certifications,
        aiRecommendations: parsedResult.recommendations,
        digitalMaturity: parsedResult.digitalMaturity,
        safetyRating: parsedResult.safetyRating,
        marketPosition: parsedResult.marketPosition,
        updatedAt: new Date(),
      };
      console.log("[CompanyAI:analyze-ai] DB save payload —", JSON.stringify(savePayload, null, 2));
      try {
        await db
          .update(companies)
          .set(savePayload)
          .where(eq(companies.id, companyId));
        console.log("[CompanyAI:analyze-ai] DB save succeeded for company", companyId);
      } catch (saveError) {
        console.error("[CompanyAI:analyze-ai] DB save FAILED:", saveError);
      }
    }

    // Auto-tag company with suggested taxonomies
    if (
      companyId &&
      parsedResult.suggestedTaxonomies &&
      parsedResult.suggestedTaxonomies.length > 0 &&
      taxonomyRows.length > 0
    ) {
      console.log("[CompanyAI:analyze-ai] Taxonomy matching — suggested:", parsedResult.suggestedTaxonomies);
      const taxonomyIds = taxonomyRows
        .filter((t) =>
          parsedResult.suggestedTaxonomies?.some(
            (suggested) =>
              t.name.toLowerCase().includes(suggested.toLowerCase()) ||
              suggested.toLowerCase().includes(t.name.toLowerCase()),
          ),
        )
        .map((t) => t.id);

      console.log("[CompanyAI:analyze-ai] Taxonomy matching — matched IDs:", taxonomyIds, "count:", taxonomyIds.length);

      if (taxonomyIds.length > 0) {
        const taxonomyInserts = taxonomyIds.map((taxId) => ({
          companyId,
          taxonomyId: taxId,
        }));

        await db.transaction(async (tx) => {
          await tx
            .delete(companyTaxonomies)
            .where(eq(companyTaxonomies.companyId, companyId));
          await tx.insert(companyTaxonomies).values(taxonomyInserts);
        });
        console.log("[CompanyAI:analyze-ai] Taxonomy insert — linked", taxonomyInserts.length, "taxonomies");
      }
    }

    // This route writes aiCompetencies/aiCapabilities/aiStrengths/
    // aiCertifications and replaces the taxonomy links — all embedding-source
    // data. force: true because the source just changed.
    if (companyId) {
      await refreshCompanyEmbedding(companyId, { force: true });
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
