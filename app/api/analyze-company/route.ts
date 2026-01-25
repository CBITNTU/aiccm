import { NextRequest } from "next/server";
import {
  createAdminClient,
  chatCompletion,
  parseAIJsonResponse,
  apiResponse,
  apiError,
  getAuthenticatedUser,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
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
    const financialData = (company.financial_data as Record<string, { value?: unknown }>) || {};
    const complianceData = (company.compliance_data as Record<string, { value?: unknown }>) || {};

    // Check data completeness (excluding description)
    const hasCapabilities = !!company.key_capabilities && company.key_capabilities.length > 20;
    const hasFinancialData = Object.keys(financialData).length > 0;
    const hasCertifications = !!company.certifications && company.certifications.length > 5;
    const hasProjects = !!company.past_projects && company.past_projects.length > 20;
    const hasWebsite = !!company.website_url;
    const hasLocation = !!company.postcode;
    
    const dataCompleteness = {
      hasCapabilities,
      hasFinancialData,
      hasCertifications,
      hasProjects,
      hasWebsite,
      hasLocation,
    };
    
    const completenessScore = Object.values(dataCompleteness).filter(Boolean).length;
    const isMinimalData = completenessScore < 3; // Less than 3 data points

    const analysisPrompt = `Rate this company across 8 dimensions (0-100). If no data is available, rate it 0. Provide a short explanation for each score.

${company.website_url ? `Visit "${company.website_url}" to extract additional information.` : ''}

Company: ${company.company_name}
Website: ${company.website_url || "N/A"}
Key Capabilities: ${company.key_capabilities || "N/A"}
Equipment: ${company.equipment || "N/A"}
Certifications: ${company.certifications || "N/A"}
Past Projects: ${company.past_projects || "N/A"}
Employees: ${financialData.employees?.value || "N/A"}
Net Assets: £${typeof financialData.netAssets?.value === 'number' ? financialData.netAssets.value.toLocaleString() : "N/A"}
Total Assets: £${typeof financialData.totalAssets?.value === 'number' ? financialData.totalAssets.value.toLocaleString() : "N/A"}
Cash: £${typeof financialData.cash?.value === 'number' ? financialData.cash.value.toLocaleString() : "N/A"}

Rate each dimension (0-100) with explanation:
- technicalExpertise
- safetyStandards
- innovation
- projectExperience
- certifications
- marketReputation
- financialHealth
- operationalCapacity
- overallScore

Return JSON:
{
  "performanceBenchmark": {
    "technicalExpertise": {"score": 0, "explanation": "short explanation"},
    "safetyStandards": {"score": 0, "explanation": "short explanation"},
    "innovation": {"score": 0, "explanation": "short explanation"},
    "projectExperience": {"score": 0, "explanation": "short explanation"},
    "certifications": {"score": 0, "explanation": "short explanation"},
    "marketReputation": {"score": 0, "explanation": "short explanation"},
    "financialHealth": {"score": 0, "explanation": "short explanation"},
    "operationalCapacity": {"score": 0, "explanation": "short explanation"},
    "overallScore": {"score": 0, "explanation": "short explanation"}
  }
}`;

    console.log("Sending analyze-company request to OpenAI...");
    console.log("📊 COMPANY DATA IN DATABASE:");
    console.log({
      name: company.company_name,
      website: company.website_url || "N/A",
      key_capabilities: company.key_capabilities ? `${company.key_capabilities.substring(0, 50)}...` : "N/A",
      equipment: company.equipment || "N/A",
      certifications: company.certifications || "N/A",
      past_projects: company.past_projects ? `${company.past_projects.substring(0, 50)}...` : "N/A",
      hasFinancialData: Object.keys(financialData).length > 0,
      hasCapabilities: !!company.key_capabilities,
      hasCertifications: hasCertifications,
      hasProjects: hasProjects,
      hasWebsite: hasWebsite,
      hasLocation: hasLocation,
      completenessScore,
      isMinimalData,
    });

    const systemPrompt = `You are a business analyst. Rate companies from 0-100 based strictly on available data. If no data exists for a dimension, rate it 0. Visit websites when provided to extract additional information.`;

    // Log the full prompt for debugging
    console.log("\n" + "=".repeat(80));
    console.log("📋 FULL PROMPT BEING SENT TO AI:");
    console.log("=".repeat(80));
    console.log("\n🔹 SYSTEM PROMPT:");
    console.log(systemPrompt);
    console.log("\n🔹 ANALYSIS PROMPT:");
    console.log(analysisPrompt);
    console.log("\n" + "=".repeat(80) + "\n");

    const response = await chatCompletion(systemPrompt, analysisPrompt, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    console.log("OpenAI response received, length:", response.length);

    let analysis: DeepCompanyAnalysis;
    try {
      const rawAnalysis = parseAIJsonResponse<{
        performanceBenchmark: Record<string, { score: number; explanation: string } | number>;
      }>(response);
      console.log("✅ Successfully parsed AI analysis");
      
      // Transform the new structure to the expected format
      const benchmark = rawAnalysis.performanceBenchmark;
      const transformScore = (value: { score: number; explanation: string } | number | undefined): number => {
        if (typeof value === 'number') return value;
        if (value && typeof value === 'object' && 'score' in value) return value.score;
        return 0;
      };

      analysis = {
        companyInfo: {},
        performanceBenchmark: {
          technicalExpertise: transformScore(benchmark.technicalExpertise),
          safetyStandards: transformScore(benchmark.safetyStandards),
          innovation: transformScore(benchmark.innovation),
          projectExperience: transformScore(benchmark.projectExperience),
          certifications: transformScore(benchmark.certifications),
          marketReputation: transformScore(benchmark.marketReputation),
          financialHealth: transformScore(benchmark.financialHealth),
          operationalCapacity: transformScore(benchmark.operationalCapacity),
          overallScore: transformScore(benchmark.overallScore),
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
      
      console.log("Performance benchmark scores:", analysis.performanceBenchmark);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", parseError);
      console.error("Raw OpenAI response:", response);
      // Fallback analysis if parsing fails
      console.warn("⚠️ Using FALLBACK analysis - AI parsing failed. This is hardcoded data!");
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
      // Continue anyway - we'll still return the analysis even if saving fails
    }

    // Queue capability taxonomy generation if relevant fields were updated
    // This will dynamically create new capabilities based on updated company data
    const relevantFieldsUpdated = 
      updateData.key_capabilities || 
      updateData.certifications || 
      updateData.past_projects;
    
    if (relevantFieldsUpdated) {
      try {
        const { enqueueJob } = await import("@/lib/services/queueService");
        await enqueueJob({
          jobType: "company_taxonomy",
          entityType: "company",
          entityId: companyId,
          priority: 5,
        });
        console.log(`Queued company_taxonomy job for updated company: ${companyId}`);
      } catch (queueError) {
        console.error("Failed to queue company taxonomy job:", queueError);
        // Don't fail the analysis if queueing fails
      }
    }

    console.log(
      "✅ Company analysis completed and saved for:",
      company.company_name
    );
    console.log("Overall score:", analysis.performanceBenchmark?.overallScore);

    // Log analysis event
    const { user } = await getAuthenticatedUser(request).catch(() => ({ user: null }));
    await logApiEvent(request, {
      actionType: "company_updated", // Analysis updates company data
      userId: user?.id || null,
      userEmail: user?.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: {
        analysisType: "comprehensive",
        companyName: company.company_name,
      },
    }).catch(() => {}); // Don't fail if logging fails

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
      500
    );
  }
}
