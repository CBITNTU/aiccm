import { NextRequest } from "next/server";
import {
  createAdminClient,
  chatCompletion,
  parseAIJsonResponse,
  apiResponse,
  apiError,
} from "@/lib/api";
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

    const analysisPrompt = `
    Analyze the following construction company and provide comprehensive performance benchmarking, core competencies, business insights, AND fill in all missing company information fields.

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
       - Technical Expertise: Assess capabilities, equipment, and project complexity
       - Safety Standards: Evaluate certifications, compliance, and safety culture
       - Innovation & Technology: Rate digital maturity and modern practices
       - Project Experience: Analyze past projects and company maturity
       - Certifications & Compliance: Review regulatory compliance and industry standards
       - Market Reputation: Evaluate overall market position and credibility
       - Financial Health: Assess financial stability, assets, and debt ratios
       - Operational Capacity: Evaluate workforce size and resource capacity

    2. CORE COMPETENCIES:
       Extract 6-9 SHORT, specific competencies (max 3-4 words each).
       Examples: "High-rise construction", "Steel fabrication", "Project management"

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
        "technicalExpertise": 85,
        "safetyStandards": 92,
        "innovation": 78,
        "projectExperience": 88,
        "certifications": 90,
        "marketReputation": 82,
        "financialHealth": 75,
        "operationalCapacity": 80,
        "overallScore": 84
      },
      "coreCompetencies": [
        "High-rise construction",
        "Steel fabrication"
      ],
      "digitalMaturity": "Medium",
      "safetyRating": "Good",
      "marketPosition": "Established regional contractor with growth potential",
      "businessInsights": [
        "Strong asset base supports large project bids",
        "Equipment diversity enables multiple service lines"
      ],
      "competitivePositioning": "Strong Competitor",
      "swotSummary": {
        "strengths": ["Strong assets", "Experienced team"],
        "weaknesses": ["Moderate debt"],
        "opportunities": ["Green building"],
        "threats": ["Economic uncertainty"]
      },
      "executiveSummary": "1-2 sentence overall assessment"
    }`;

    console.log("Sending analyze-company request to OpenAI...");

    const systemPrompt =
      "You are an expert construction industry analyst. Provide accurate, fair assessments based on available data.";

    const response = await chatCompletion(systemPrompt, analysisPrompt, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    let analysis: DeepCompanyAnalysis;
    try {
      analysis = parseAIJsonResponse<DeepCompanyAnalysis>(response);

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
      console.error("Failed to parse OpenAI response:", response);
      // Fallback analysis if parsing fails
      analysis = {
        companyInfo: {},
        performanceBenchmark: {
          technicalExpertise: 70,
          safetyStandards: 70,
          innovation: 65,
          projectExperience: 70,
          certifications: 65,
          marketReputation: 70,
          financialHealth: 70,
          operationalCapacity: 70,
          overallScore: 69,
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

    console.log(
      "Company analysis completed and saved for:",
      company.company_name
    );

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
