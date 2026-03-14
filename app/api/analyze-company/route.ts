import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { performanceBenchmarkSchema } from "@/lib/schemas/performanceBenchmark";
import { logApiEvent } from "@/lib/services/eventLogger";
import { generateCompanyCapabilityTaxonomy } from "@/lib/services/companyAIService";
import type { DeepCompanyAnalysis } from "@/lib/api/types";
import { z } from "zod";
import {
  requireAuth,
  validateBody,
  handleApiError,
  isCompanyMember,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

const analyzeCompanyInputSchema = z.object({
  companyId: z.string().uuid(),
});

function buildPerformanceBenchmarkPrompt(
  company: {
    companyName: string;
    websiteUrl?: string | null;
    keyCapabilities?: string | null;
    equipment?: string | null;
    certifications?: string | null;
    pastProjects?: string | null;
    financialData?: Record<string, { value?: unknown }> | null;
  },
): string {
  const financialData = company.financialData || {};

  return `Score these 8 dimensions (0-100) with a short explanation. Return JSON with performanceBenchmark as below.

Company: ${company.companyName}
Website: ${company.websiteUrl || "N/A"}
Key Capabilities: ${company.keyCapabilities || "N/A"}
Equipment: ${company.equipment || "N/A"}
Certifications: ${company.certifications || "N/A"}
Past Projects: ${company.pastProjects || "N/A"}
Employees: ${financialData.employees?.value || "N/A"}
Net Assets: \u00A3${typeof financialData.netAssets?.value === "number" ? financialData.netAssets.value.toLocaleString() : "N/A"}
Total Assets: \u00A3${typeof financialData.totalAssets?.value === "number" ? financialData.totalAssets.value.toLocaleString() : "N/A"}
Cash: \u00A3${typeof financialData.cash?.value === "number" ? financialData.cash.value.toLocaleString() : "N/A"}`;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await validateBody(
      request,
      analyzeCompanyInputSchema,
    );

    // Verify ownership or superadmin
    const companyRows = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const company = companyRows[0];
    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      return apiResponse({ error: "Not authorized to analyze this company" }, 403);
    }

    const prompt = buildPerformanceBenchmarkPrompt({
      companyName: company.companyName,
      websiteUrl: company.websiteUrl,
      keyCapabilities: company.keyCapabilities,
      equipment: company.equipment,
      certifications: company.certifications,
      pastProjects: company.pastProjects,
      financialData: company.financialData as Record<string, { value?: unknown }> | null,
    });

    const rawAnalysis = await aiGenerateObject({
      schema: performanceBenchmarkSchema,
      system: `Rate company 0-100 on each dimension from available data only; 0 if no data.`,
      prompt,
      maxTokens: 10000,
    });

    const benchmark = rawAnalysis.performanceBenchmark;
    const analysis: DeepCompanyAnalysis = {
      companyInfo: {},
      performanceBenchmark: {
        technicalExpertise: benchmark.technicalExpertise.score,
        safetyStandards: benchmark.safetyStandards.score,
        innovation: benchmark.innovation.score,
        projectExperience: benchmark.projectExperience.score,
        certifications: benchmark.certifications.score,
        marketReputation: benchmark.marketReputation.score,
        financialHealth: benchmark.financialHealth.score,
        operationalCapacity: benchmark.operationalCapacity.score,
        overallScore: benchmark.overallScore.score,
      },
      coreCompetencies: [],
      digitalMaturity: "Not assessed yet",
      safetyRating: "Not assessed yet",
      marketPosition: "Not assessed yet",
      businessInsights: [],
      competitivePositioning: "Developing",
      swotSummary: {
        strengths: [],
        weaknesses: [],
        opportunities: [],
        threats: [],
      },
      executiveSummary: "Analysis completed.",
    };

    // Save analysis results AND fill company information fields
    const updateData: Partial<typeof companies.$inferInsert> = {
      aiAnalysis: analysis,
      updatedAt: new Date(),
    };

    const companyInfo = analysis.companyInfo || {};

    if (
      companyInfo.key_capabilities &&
      (!company.keyCapabilities || company.keyCapabilities.length < 50)
    ) {
      updateData.keyCapabilities = companyInfo.key_capabilities as string;
    }
    if (
      companyInfo.equipment &&
      (!company.equipment || company.equipment.length < 20)
    ) {
      updateData.equipment = companyInfo.equipment as string;
    }
    if (
      companyInfo.certifications &&
      (!company.certifications || company.certifications.length < 20)
    ) {
      updateData.certifications = companyInfo.certifications as string;
    }
    if (
      companyInfo.past_projects &&
      (!company.pastProjects || company.pastProjects.length < 50)
    ) {
      updateData.pastProjects = companyInfo.past_projects as string;
    }
    if (companyInfo.contact_person && !company.contactPerson) {
      updateData.contactPerson = companyInfo.contact_person as string;
    }
    if (companyInfo.contact_email && !company.contactEmail) {
      updateData.contactEmail = companyInfo.contact_email as string;
    }
    if (companyInfo.contact_phone && !company.contactPhone) {
      updateData.contactPhone = companyInfo.contact_phone as string;
    }
    if (companyInfo.postcode && !company.postcode) {
      updateData.postcode = companyInfo.postcode as string;
    }

    if (analysis.digitalMaturity) {
      updateData.digitalMaturity = analysis.digitalMaturity;
    }
    if (analysis.safetyRating) {
      updateData.safetyRating = analysis.safetyRating;
    }
    if (analysis.marketPosition) {
      updateData.marketPosition = analysis.marketPosition;
    }

    try {
      await db
        .update(companies)
        .set(updateData)
        .where(eq(companies.id, companyId));
    } catch (updateError) {
      console.error("Error saving analysis to database:", updateError);
    }

    // Generate capabilities from the static list
    try {
      await generateCompanyCapabilityTaxonomy(companyId, false);
    } catch (capabilityError) {
      console.error("Failed to generate company capabilities:", capabilityError);
    }

    await logApiEvent(request, {
      actionType: "company_updated",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: {
        analysisType: "comprehensive",
        companyName: company.companyName,
      },
    }).catch(() => {});

    return apiResponse({
      success: true,
      analysis,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
