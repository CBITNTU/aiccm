import { NextRequest } from "next/server";
import { createAdminClient, apiResponse } from "@/lib/api";
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

const analyzeCompanyInputSchema = z.object({
  companyId: z.string().uuid(),
});

function buildPerformanceBenchmarkPrompt(
  company: {
    company_name: string;
    website_url?: string | null;
    key_capabilities?: string | null;
    equipment?: string | null;
    certifications?: string | null;
    past_projects?: string | null;
    financial_data?: Record<string, { value?: unknown }> | null;
  },
): string {
  const financialData = company.financial_data || {};

  return `Score these 8 dimensions (0-100) with a short explanation. Return JSON with performanceBenchmark as below.

Company: ${company.company_name}
Website: ${company.website_url || "N/A"}
Key Capabilities: ${company.key_capabilities || "N/A"}
Equipment: ${company.equipment || "N/A"}
Certifications: ${company.certifications || "N/A"}
Past Projects: ${company.past_projects || "N/A"}
Employees: ${financialData.employees?.value || "N/A"}
Net Assets: £${typeof financialData.netAssets?.value === "number" ? financialData.netAssets.value.toLocaleString() : "N/A"}
Total Assets: £${typeof financialData.totalAssets?.value === "number" ? financialData.totalAssets.value.toLocaleString() : "N/A"}
Cash: £${typeof financialData.cash?.value === "number" ? financialData.cash.value.toLocaleString() : "N/A"}`;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await validateBody(
      request,
      analyzeCompanyInputSchema,
    );

    const supabase = createAdminClient();

    // Verify ownership or superadmin
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      return apiResponse({ error: "Not authorized to analyze this company" }, 403);
    }

    const prompt = buildPerformanceBenchmarkPrompt(
      company as unknown as Parameters<typeof buildPerformanceBenchmarkPrompt>[0],
    );

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
    const updateData: Record<string, unknown> = {
      ai_analysis: analysis,
      updated_at: new Date().toISOString(),
    };

    const companyInfo = analysis.companyInfo || {};

    if (
      companyInfo.key_capabilities &&
      (!company.key_capabilities || company.key_capabilities.length < 50)
    ) {
      updateData.key_capabilities = companyInfo.key_capabilities;
    }
    if (
      companyInfo.certifications &&
      (!company.certifications || company.certifications.length < 20)
    ) {
      updateData.certifications = companyInfo.certifications;
    }
    if (
      companyInfo.past_projects &&
      (!company.past_projects || company.past_projects.length < 50)
    ) {
      updateData.past_projects = companyInfo.past_projects;
    }
    if (companyInfo.contact_person && !company.contact_person) {
      updateData.contact_person = companyInfo.contact_person;
    }
    if (companyInfo.contact_email && !company.contact_email) {
      updateData.contact_email = companyInfo.contact_email;
    }
    if (companyInfo.contact_phone && !company.contact_phone) {
      updateData.contact_phone = companyInfo.contact_phone;
    }
    if (companyInfo.postcode && !company.postcode) {
      updateData.postcode = companyInfo.postcode;
    }

    if (analysis.digitalMaturity) {
      updateData.digital_maturity = analysis.digitalMaturity;
    }

    const { error: updateError } = await supabase
      .from("companies")
      .update(updateData)
      .eq("id", companyId);

    if (updateError) {
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
        companyName: company.company_name,
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
