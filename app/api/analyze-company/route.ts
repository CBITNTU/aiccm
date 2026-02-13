import { NextRequest } from "next/server";
import {
  createAdminClient,
  apiResponse,
  apiError,
  getAuthenticatedUser,
} from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { performanceBenchmarkSchema } from "@/lib/schemas/performanceBenchmark";
import { logApiEvent } from "@/lib/services/eventLogger";
import { generateCompanyCapabilityTaxonomy } from "@/lib/services/companyAIService";
import type { DeepCompanyAnalysis } from "@/lib/api/types";

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();

    if (!companyId) {
      return apiError("Company ID is required", 400);
    }

    const supabase = createAdminClient();

    // Fetch company data
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return apiError("Company not found", 404);
    }

    // Comprehensive analysis prompt with performance benchmarking
    const financialData =
      (company.financial_data as Record<string, { value?: unknown }>) || {};

    const analysisPrompt = `Score these 8 dimensions (0-100) with a short explanation. Return JSON with performanceBenchmark as below.

${company.website_url ? `Visit "${company.website_url}" to extract additional information.` : ""}

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

    const systemPrompt = `Rate company 0-100 on each dimension from available data only; 0 if no data. Optional: use website when provided.`;

    console.log("Sending analyze-company request to AI...");

    let analysis: DeepCompanyAnalysis;
    try {
      const rawAnalysis = await aiGenerateObject({
        schema: performanceBenchmarkSchema,
        system: systemPrompt,
        prompt: analysisPrompt,
        maxTokens: 10000,
      });

      console.log("AI response received and parsed");

      const benchmark = rawAnalysis.performanceBenchmark;
      analysis = {
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

      console.log(
        "Performance benchmark scores:",
        analysis.performanceBenchmark,
      );
    } catch (parseError) {
      console.error("Failed to get AI analysis:", parseError);
      console.warn(
        "Using FALLBACK analysis - AI call failed. This is hardcoded data!",
      );
      analysis = {
        companyInfo: {},
        performanceBenchmark: {
          technicalExpertise: 50,
          safetyStandards: 50,
          innovation: 50,
          projectExperience: 50,
          certifications: 50,
          marketReputation: 50,
          financialHealth: 50,
          operationalCapacity: 50,
          overallScore: 50,
        },
        coreCompetencies: ["General construction"],
        digitalMaturity: "Not assessed yet",
        safetyRating: "Not assessed yet",
        marketPosition: "Not assessed yet",
        businessInsights: ["Analysis incomplete, please try again"],
        competitivePositioning: "Emerging Player",
        swotSummary: {
          strengths: ["Established presence"],
          weaknesses: ["Limited data"],
          opportunities: ["Market expansion"],
          threats: ["Competition"],
        },
        executiveSummary: "Analysis could not be completed.",
      };
    }

    // Save analysis results AND fill company information fields
    const updateData: Record<string, unknown> = {
      ai_analysis: analysis,
      updated_at: new Date().toISOString(),
    };

    // Fill in company fields if they were empty or inadequate
    const companyInfo = analysis.companyInfo || {};

    if (
      companyInfo.key_capabilities &&
      (!company.key_capabilities || company.key_capabilities.length < 50)
    ) {
      updateData.key_capabilities = companyInfo.key_capabilities;
    }
    if (
      companyInfo.equipment &&
      (!company.equipment || company.equipment.length < 20)
    ) {
      updateData.equipment = companyInfo.equipment;
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

    // Update assessment ratings from analysis
    if (analysis.digitalMaturity) {
      updateData.digital_maturity = analysis.digitalMaturity;
    }
    if (analysis.safetyRating) {
      updateData.safety_rating = analysis.safetyRating;
    }
    if (analysis.marketPosition) {
      updateData.market_position = analysis.marketPosition;
    }

    const { error: updateError } = await supabase
      .from("companies")
      .update(updateData)
      .eq("id", companyId);

    if (updateError) {
      console.error("Error saving analysis to database:", updateError);
    }

    // Generate capabilities from the static list based on company analysis
    try {
      console.log("Generating company capabilities from static list...");
      const capabilityIds = await generateCompanyCapabilityTaxonomy(
        companyId,
        false,
      );
      console.log(
        `Generated ${capabilityIds.length} capabilities for company ${companyId}`,
      );
    } catch (capabilityError) {
      console.error(
        "Failed to generate company capabilities:",
        capabilityError,
      );
    }

    console.log(
      "Company analysis completed and saved for:",
      company.company_name,
    );

    // Log analysis event
    const { user } = await getAuthenticatedUser(request).catch(() => ({
      user: null,
    }));
    await logApiEvent(request, {
      actionType: "company_updated",
      userId: user?.id || null,
      userEmail: user?.email || undefined,
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
    console.error("Error in analyze-company:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    return apiResponse(
      {
        error: message,
        success: false,
      },
      500,
    );
  }
}
