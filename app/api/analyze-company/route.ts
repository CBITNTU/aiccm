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

    // Check data completeness
    const hasDescription = !!company.description && company.description.length > 20;
    const hasCapabilities = !!company.key_capabilities && company.key_capabilities.length > 20;
    const hasFinancialData = Object.keys(financialData).length > 0;
    const hasCertifications = !!company.certifications && company.certifications.length > 5;
    const hasProjects = !!company.past_projects && company.past_projects.length > 20;
    const hasWebsite = !!company.website_url;
    const hasLocation = !!company.postcode;
    
    const dataCompleteness = {
      hasDescription,
      hasCapabilities,
      hasFinancialData,
      hasCertifications,
      hasProjects,
      hasWebsite,
      hasLocation,
    };
    
    const completenessScore = Object.values(dataCompleteness).filter(Boolean).length;
    const isMinimalData = completenessScore < 3; // Less than 3 data points

    const analysisPrompt = `
    Analyze the following company and provide comprehensive performance benchmarking, core competencies, business insights, AND fill in all missing company information fields.
    
    Note: The company may be in any industry (construction, manufacturing, services, technology, retail, etc.). Adapt your analysis to the company's actual industry based on available information.

    ⚠️ IMPORTANT: If the company has MINIMAL DATA (most fields are "N/A"), be CONSERVATIVE in your scoring. 
    - Companies with minimal data should score 40-60 overall, not 80+
    - Only score high (70+) if there is SUBSTANTIAL evidence
    - If data is missing, indicate this in your assessment
    - Do NOT make assumptions - base scores ONLY on available data

    COMPANY PROFILE:
    Company: ${company.company_name}
    Website: ${company.website_url || "N/A"}
    Description: ${company.description || "N/A - FILL THIS"}
    Key Capabilities: ${company.key_capabilities || "N/A - FILL THIS"}
    Equipment: ${company.equipment || "N/A - FILL THIS"}
    Certifications: ${company.certifications || "N/A - FILL THIS"}
    Past Projects: ${company.past_projects || "N/A - FILL THIS"}
    Contact Person: ${company.contact_person || "N/A - FILL THIS"}
    Contact Email: ${company.contact_email || "N/A - FILL THIS"}
    Contact Phone: ${company.contact_phone || "N/A - FILL THIS"}
    Postcode: ${company.postcode || "N/A - FILL THIS"}
    Safety Rating: ${company.safety_rating || "N/A"}
    Digital Maturity: ${company.digital_maturity || "N/A"}
    
    DATA COMPLETENESS: ${completenessScore}/7 fields have data. ${isMinimalData ? "⚠️ MINIMAL DATA - Use conservative scoring (40-60 range)" : "Sufficient data for analysis"}

    FINANCIAL DATA:
    Employees: ${financialData.employees?.value || "N/A"}
    Net Assets: £${typeof financialData.netAssets?.value === 'number' ? financialData.netAssets.value.toLocaleString() : "N/A"}
    Total Assets: £${typeof financialData.totalAssets?.value === 'number' ? financialData.totalAssets.value.toLocaleString() : "N/A"}
    Total Liabilities: £${typeof financialData.totalLiabilities?.value === 'number' ? financialData.totalLiabilities.value.toLocaleString() : "N/A"}
    Cash: £${typeof financialData.cash?.value === 'number' ? financialData.cash.value.toLocaleString() : "N/A"}
    Debt Ratio: ${financialData.debtRatio?.value || "N/A"}

    COMPLIANCE DATA:
    Accounts Filed: ${complianceData.accountsFiled?.value || "N/A"}
    Accounts Due: ${complianceData.accountsDue?.value || "N/A"}
    Confirmation Statement: ${complianceData.confirmationStatement?.value || "N/A"}
    Active Charges: ${complianceData.activeCharges?.value || "N/A"}

    ANALYSIS REQUIREMENTS:

    0. COMPANY INFORMATION ENRICHMENT:
       For ANY field marked "N/A - FILL THIS", provide concise, useful information.
       - description: 2-3 sentences about the company's business and market position
       - key_capabilities: List specific technical capabilities and services (100-150 words max)
       - equipment: Return ONLY equipment names separated by semicolons (NO sentences, NO line breaks).
       - certifications: Return ONLY certification names separated by semicolons (NO sentences, NO line breaks).
       - past_projects: Brief list of 2-3 notable projects with basic details (50-100 words total)
       - contact_person: Extract contact name if available from website
       - contact_email: Extract contact email if available
       - contact_phone: Extract contact phone if available
       - postcode: Extract postcode/location if available

    CRITICAL FORMAT REQUIREMENTS:
    - For equipment and certifications fields: ONLY names separated by semicolons
    - NO full sentences, NO descriptive phrases, NO connecting words
    - Example CORRECT format: "ISO 9001; ISO 14001; OHSAS 18001"
    - Example WRONG format: "The company holds ISO 9001 for quality management and ISO 14001"

    1. PERFORMANCE BENCHMARKING (0-100 scores):
       Adapt these metrics to the company's industry. For example:
       - Technical Expertise: Assess technical capabilities, equipment/tools, and operational complexity. If no data, score 40-50.
       - Safety Standards / Compliance: Evaluate certifications, regulatory compliance, and quality standards relevant to the industry. If no certifications, score 40-50.
       - Innovation & Technology: Rate digital maturity, modern practices, and technological adoption. If no data, score 40-50.
       - Project/Service Experience: Analyze past projects, client work, or service history and company maturity. If no history listed, score 40-50.
       - Certifications & Compliance: Review industry-specific regulatory compliance and standards. If no certifications, score 40-50.
       - Market Reputation: Evaluate overall market position, brand credibility, and industry standing. If minimal data, score 40-50.
       - Financial Health: Assess financial stability, assets, cash flow, and debt ratios. If no financial data, score 40-50.
       - Operational Capacity: Evaluate workforce size, resource capacity, and operational scale. If no data, score 40-50.
       
       ⚠️ SCORING RULES:
       - If most fields are "N/A", overall score should be 40-60, NOT 70+
       - Only score 70+ if there is SUBSTANTIAL evidence (multiple data points)
       - Be conservative - it's better to score low with minimal data than to guess high
       - Overall score should reflect data completeness: minimal data = 40-60, good data = 60-80, excellent data = 80-100

    2. CORE COMPETENCIES:
       Extract 6-9 SHORT, specific competencies relevant to the company's industry (max 3-4 words each).
       Examples (construction): "High-rise construction", "Steel fabrication", "Project management"
       Examples (tech): "Software development", "Cloud infrastructure", "Data analytics"
       Examples (services): "Consulting services", "Customer support", "Business process optimization"
       Adapt to the actual industry based on company description and capabilities.

    3. ASSESSMENT RATINGS:
       Provide these specific assessments:
       - digitalMaturity: Rate as "High", "Medium", "Low", or "Not assessed yet"
       - safetyRating: Rate as "Excellent", "Good", "Fair", "Poor", or "Not assessed yet"
       - marketPosition: Brief summary (1 sentence) or "Not assessed yet"

    4. BUSINESS INSIGHTS:
       Provide 3-5 SHORT strategic insights (one sentence each, max 15 words per insight).
       Cover: strengths, opportunities, risks, financial health, or recommendations.

    5. COMPETITIVE POSITIONING:
       Rate the company's position: "Market Leader", "Strong Competitor", "Emerging Player", or "Developing"

    6. SWOT SUMMARY:
       Brief bullets for Strengths, Weaknesses, Opportunities, Threats (2-3 SHORT items each, max 5 words per item)

    Return ONLY a JSON object with this exact structure:
    {
      "companyInfo": {
        "description": "2-3 sentence company description",
        "key_capabilities": "100-150 word capabilities list",
        "equipment": "Equipment names only",
        "certifications": "ISO 9001; ISO 14001; OHSAS 18001",
        "past_projects": "",
        "contact_person": "Contact name or null",
        "contact_email": "Contact email or null",
        "contact_phone": "Contact phone or null",
        "postcode": "Company postcode or null"
      },
      "performanceBenchmark": {
        "technicalExpertise": 50,
        "safetyStandards": 50,
        "innovation": 50,
        "projectExperience": 50,
        "certifications": 50,
        "marketReputation": 50,
        "financialHealth": 50,
        "operationalCapacity": 50,
        "overallScore": 50
      },
      "coreCompetencies": [
        "Industry-specific competency 1",
        "Industry-specific competency 2"
      ],
      "digitalMaturity": "Medium",
      "safetyRating": "Good",
      "marketPosition": "Established company with growth potential in [industry]",
      "businessInsights": [
        "Industry-specific insight about strengths or opportunities",
        "Strategic insight relevant to company's business model"
      ],
      "competitivePositioning": "Strong Competitor",
      "swotSummary": {
        "strengths": ["Industry-specific strength", "Company advantage"],
        "weaknesses": ["Area for improvement"],
        "opportunities": ["Market opportunity"],
        "threats": ["Industry or economic risk"]
      },
      "executiveSummary": "1-2 sentence overall assessment"
    }`;

    console.log("Sending analyze-company request to OpenAI...");
    console.log("Company data being analyzed:", {
      name: company.company_name,
      hasDescription: !!company.description,
      hasCapabilities: !!company.key_capabilities,
      hasFinancialData: Object.keys(financialData).length > 0,
    });

    const systemPrompt = `You are an expert business analyst. Provide accurate, fair assessments for companies across all industries based STRICTLY on available data.

CRITICAL SCORING RULES:
- If company has minimal data (most fields are N/A), scores should be CONSERVATIVE (40-60 range)
- Do NOT score 70+ unless there is SUBSTANTIAL evidence
- Missing data = lower scores, not assumptions
- Overall score should reflect data completeness: minimal data = 40-60, good data = 60-80, excellent data = 80-100
- Be honest about data limitations in the executive summary
- Adapt your analysis to the company's industry (construction, manufacturing, services, tech, etc.) based on available information`;

    const response = await chatCompletion(systemPrompt, analysisPrompt, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    console.log("OpenAI response received, length:", response.length);

    let analysis: DeepCompanyAnalysis;
    try {
      analysis = parseAIJsonResponse<DeepCompanyAnalysis>(response);
      console.log("✅ Successfully parsed AI analysis");
      console.log("Performance benchmark scores:", analysis.performanceBenchmark);
      
      // Validate scores are reasonable given data completeness
      if (isMinimalData && analysis.performanceBenchmark.overallScore > 65) {
        console.warn("⚠️ WARNING: Company has minimal data but scored >65. This seems too high.");
        console.warn("Data completeness:", dataCompleteness);
        console.warn("Consider adjusting scores to be more conservative.");
      }

      // Validate required fields
      const requiredFields = [
        "companyInfo",
        "performanceBenchmark",
        "coreCompetencies",
        "digitalMaturity",
        "safetyRating",
        "marketPosition",
        "businessInsights",
        "competitivePositioning",
        "swotSummary",
        "executiveSummary",
      ];
      const missingFields = requiredFields.filter(
        (field) => (analysis as unknown as Record<string, unknown>)[field] === undefined
      );

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
      }

      // Ensure arrays are properly formatted
      if (!Array.isArray(analysis.coreCompetencies))
        analysis.coreCompetencies = [];
      if (!Array.isArray(analysis.businessInsights))
        analysis.businessInsights = [];
      if (!analysis.companyInfo) analysis.companyInfo = {};
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
      companyInfo.description &&
      (!company.description || company.description.length < 50)
    ) {
      updateData.description = companyInfo.description;
    }
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
      updateData.past_projects || 
      updateData.description;
    
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
    console.log("Analysis source:", analysis.executiveSummary?.includes("could not be completed") ? "FALLBACK (hardcoded)" : "AI-generated");

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
