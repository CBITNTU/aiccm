import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { performanceBenchmarkSchema } from "@/lib/schemas/performanceBenchmark";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  generateCompanyCapabilityTaxonomy,
  generateCompanySummary,
} from "@/lib/services/companyAIService";
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
import {
  companyHasSparseData,
  enrichCompanyData,
  fetchCompanySources,
} from "@/lib/services/companyEnrichmentService";
import { NextResponse } from "next/server";
import { getPlatformAnalysisSettings } from "@/lib/platformAnalysisSettings";
import { getAnalysisRunsThisMonth, getEffectiveAnalysisLimit, getNextMonthStart } from "@/lib/analysisUsage";

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
  scrapedContent?: {
    websiteHtml: string;
    companiesHouseHtml: string;
    endoleHtml: string;
  },
): string {
  const financialData = company.financialData || {};

  let prompt = `Score these 8 dimensions (0-100) with a short explanation. Also extract or infer company information (description, key_capabilities, certifications, past_projects, equipment, postcode, contact details) from any available data. Return JSON with performanceBenchmark and companyInfo.

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

  if (scrapedContent) {
    if (scrapedContent.websiteHtml) {
      prompt += `\n\n--- Scraped Website Content ---\n${scrapedContent.websiteHtml}`;
    }
    if (scrapedContent.companiesHouseHtml) {
      prompt += `\n\n--- Companies House Data ---\n${scrapedContent.companiesHouseHtml}`;
    }
    if (scrapedContent.endoleHtml) {
      prompt += `\n\n--- Endole Financial Data ---\n${scrapedContent.endoleHtml.slice(0, 12000)}`;
    }
  }

  return prompt;
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

    let company = companyRows[0];
    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    console.log("[CompanyAI:analyze] Input company data —", {
      companyName: company.companyName,
      hasWebsiteUrl: !!company.websiteUrl,
      hasKeyCapabilities: !!company.keyCapabilities,
      hasEquipment: !!company.equipment,
      hasCertifications: !!company.certifications,
      hasPastProjects: !!company.pastProjects,
      hasFinancialData: !!company.financialData,
    });

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      return apiResponse({ error: "Not authorized to analyze this company" }, 403);
    }

    // Check monthly analysis run limit
    const [analysisSettings, analysisRunsThisMonth] = await Promise.all([
      getPlatformAnalysisSettings(),
      getAnalysisRunsThisMonth(companyId),
    ]);
    const analysisLimit = getEffectiveAnalysisLimit(company, analysisSettings);
    if (analysisRunsThisMonth >= analysisLimit) {
      const resetsAt = getNextMonthStart().toISOString();
      return NextResponse.json(
        {
          error: `Analysis limit reached (${analysisRunsThisMonth}/${analysisLimit} this month). Resets on ${new Date(resetsAt).toLocaleDateString()}.`,
          limitExceeded: true,
          used: analysisRunsThisMonth,
          limit: analysisLimit,
          resetsAt,
        },
        { status: 429 },
      );
    }

    // Prefill fallback: if company has no enriched data, run prefill first
    if (
      companyHasSparseData(company) &&
      (company.companiesHouseNumber || company.websiteUrl)
    ) {
      console.log("[CompanyAI:analyze] No prefilled data found, running enrichment fallback...");
      try {
        const enriched = await enrichCompanyData(companyId);
        if (enriched) {
          // Re-read company to get enriched fields for the benchmark prompt
          const refreshed = await db
            .select()
            .from(companies)
            .where(eq(companies.id, companyId))
            .limit(1);
          if (refreshed[0]) {
            company = refreshed[0];
            console.log("[CompanyAI:analyze] Enrichment fallback succeeded, using enriched data");
          }
        }
      } catch (enrichError) {
        console.error("[CompanyAI:analyze] Enrichment fallback failed, continuing with existing data:", enrichError);
      }
    }

    // Fetch raw HTML from external sources to inject directly into the benchmark prompt
    let scrapedContent: {
      websiteHtml: string;
      companiesHouseHtml: string;
      endoleHtml: string;
    } | undefined;

    if (
      companyHasSparseData(company) &&
      (company.companiesHouseNumber || company.websiteUrl)
    ) {
      console.log("[CompanyAI:analyze] Company data is sparse, fetching external sources...");
      try {
        const sources = await fetchCompanySources(
          company.companyName,
          company.companiesHouseNumber,
          company.websiteUrl,
        );
        if (sources.websiteHtml || sources.companiesHouseHtml || sources.endoleHtml) {
          scrapedContent = sources;
          console.log("[CompanyAI:analyze] Scraped content available —", {
            websiteChars: sources.websiteHtml.length,
            companiesHouseChars: sources.companiesHouseHtml.length,
            endoleChars: sources.endoleHtml.length,
          });
        } else {
          console.log("[CompanyAI:analyze] No external data fetched. Errors:", sources.errors);
        }
      } catch (fetchError) {
        console.error("[CompanyAI:analyze] Source fetching failed:", fetchError);
      }
    }

    const prompt = buildPerformanceBenchmarkPrompt({
      companyName: company.companyName,
      websiteUrl: company.websiteUrl,
      keyCapabilities: company.keyCapabilities,
      equipment: company.equipment,
      certifications: company.certifications,
      pastProjects: company.pastProjects,
      financialData: company.financialData as Record<string, { value?: unknown }> | null,
    }, scrapedContent);

    console.log("[CompanyAI:analyze] Prompt —", prompt);

    const rawAnalysis = await aiGenerateObject({
      schema: performanceBenchmarkSchema,
      system: `Rate company 0-100 on each dimension. Analyze ALL available data including any scraped web content, Companies House data, and Endole financial data provided. Extract company information from any source available. Score 0 only if genuinely no relevant data exists across all sources.`,
      prompt,
      maxTokens: 10000,
    });

    console.log("[CompanyAI:analyze] AI response — benchmark scores:", JSON.stringify(rawAnalysis.performanceBenchmark, null, 2));
    console.log("[CompanyAI:analyze] AI response — companyInfo:", JSON.stringify(rawAnalysis.companyInfo, null, 2));

    const benchmark = rawAnalysis.performanceBenchmark;
    const analysis: DeepCompanyAnalysis = {
      companyInfo: rawAnalysis.companyInfo,
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

    console.log("[CompanyAI:analyze] Update payload (before field merging) — aiAnalysis set, updatedAt set");

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

    // Mark as enriched so subsequent runs skip re-scraping
    if (scrapedContent) {
      updateData.systemExtracted = {
        ...((company.systemExtracted as Record<string, unknown>) || {}),
        enrichedAt: new Date().toISOString(),
        enrichmentResult: "inline_benchmark",
      };
    }

    console.log("[CompanyAI:analyze] Final update payload fields —", Object.keys(updateData));
    console.log("[CompanyAI:analyze] Final update payload values —", JSON.stringify(updateData, null, 2));

    try {
      await db
        .update(companies)
        .set(updateData)
        .where(eq(companies.id, companyId));
      console.log("[CompanyAI:analyze] DB update succeeded for company", companyId);
    } catch (updateError) {
      console.error("[CompanyAI:analyze] DB update FAILED:", updateError);
    }

    // Generate capabilities from the static list
    try {
      console.log("[CompanyAI:analyze] Starting capability taxonomy generation...");
      const taxonomyResult = await generateCompanyCapabilityTaxonomy(companyId, false);
      console.log("[CompanyAI:analyze] Capability taxonomy result —", taxonomyResult);
    } catch (capabilityError) {
      console.error("[CompanyAI:analyze] Capability taxonomy FAILED:", capabilityError);
    }

    // Generate AI summary for matching and UI display
    try {
      console.log("[CompanyAI:analyze] Starting summary generation...");
      const summaryResult = await generateCompanySummary(companyId);
      console.log("[CompanyAI:analyze] Summary result — length:", summaryResult.length, "preview:", summaryResult.substring(0, 200));
    } catch (summaryError) {
      console.error("[CompanyAI:analyze] Summary generation FAILED:", summaryError);
    }

    logApiEvent(request, {
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
