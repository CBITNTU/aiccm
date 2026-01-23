import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  chatCompletion,
  parseAIJsonResponse,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { runLLM } from "@/lib/services/llmLimiter";
import type { TenderMatchResult } from "@/lib/api/types";

interface CompanyData {
  id: string;
  company_name: string;
  description: string | null;
  key_capabilities: string | null;
  location?: string | null;
  postcode: string | null;
  past_projects: string | null;
  certifications: string | null;
  equipment: string | null;
  safety_rating: string | null;
  digital_maturity: string | null;
}

interface TenderData {
  id: string;
  title: string;
  description: string | null;
  buyer: string;
  location: string | null;
  budget_min: number | null;
  budget_max: number | null;
  deadline: string | null;
  cpv_codes: string[] | null;
  requirements: unknown;
  contact_info: unknown;
}

/**
 * AI-based scoring similar to grant-matching's approach
 * Uses LLM to deeply evaluate company-tender match with weighted criteria
 */
async function analyzeTenderMatch(
  company: CompanyData,
  tender: TenderData
): Promise<TenderMatchResult> {
  // Build company profile text (like grant-matching builds researcher profile)
  const companyProfile = [
    `Company: ${company.company_name}`,
    company.description ? `Description: ${company.description}` : '',
    company.key_capabilities ? `Capabilities: ${company.key_capabilities}` : '',
    company.past_projects ? `Past Projects: ${company.past_projects}` : '',
    company.certifications ? `Certifications: ${company.certifications}` : '',
    company.equipment ? `Equipment: ${company.equipment}` : '',
    company.postcode || company.location ? `Location: ${company.postcode || company.location}` : '',
  ].filter(Boolean).join('\n');

  // Build tender information (like grant-matching's grant info)
  const tenderInfo = [
    `Title: ${tender.title}`,
    tender.description ? `Description: ${tender.description}` : '',
    `Buyer: ${tender.buyer}`,
    tender.location ? `Location: ${tender.location}` : '',
    tender.budget_min && tender.budget_max 
      ? `Budget: £${tender.budget_min.toLocaleString()} - £${tender.budget_max.toLocaleString()}`
      : tender.budget_min 
        ? `Budget: £${tender.budget_min.toLocaleString()}+`
        : tender.budget_max
          ? `Budget: Up to £${tender.budget_max.toLocaleString()}`
          : '',
    tender.deadline ? `Deadline: ${new Date(tender.deadline).toLocaleDateString()}` : '',
    tender.cpv_codes && tender.cpv_codes.length > 0 ? `CPV Codes: ${tender.cpv_codes.join(', ')}` : '',
    tender.requirements ? `Requirements: ${JSON.stringify(tender.requirements)}` : '',
  ].filter(Boolean).join('\n');

  // Use weighted scoring approach like grant-matching
  const prompt = `
Objective:
Evaluate the relevance of a tender opportunity to the company's profile by assessing compatibility across critical dimensions. Use a weighted scoring system to quantify alignment.

Company Profile:
${companyProfile}

Tender Information:
${tenderInfo}

Evaluation Criteria & Weighting:
Capability Match (40 points) - Does the company have the required skills, equipment, and experience?
Experience Match (25 points) - Does the company's past projects demonstrate relevant experience?
Location Match (15 points) - Geographic proximity and location fit
Certification Match (20 points) - Does the company have required certifications and qualifications?

Final Scoring & Relevance Classification
Total Score: [0-100]

Please evaluate the match strictly and exclusively in the following format (ALL integers, no fractions):

Total Score: [0-100]
Criteria Scores:
Capability Match: [0-40]
Experience Match: [0-25]
Location Match: [0-15]
Certification Match: [0-20]

Category Rationales:
Capability Match: <1–2 sentences>
Experience Match: <1–2 sentences>
Location Match: <1–2 sentences>
Certification Match: <1–2 sentences>

Summary Explanation: <~200 words>
Alignment Rationale: <~100 words>
`;

  const systemPrompt = "You are an expert in construction and procurement tender matching. Always respond with valid text in the exact format specified above.";

  try {
    const estTokens = Math.ceil((prompt.length + companyProfile.length + tenderInfo.length) / 4) + 400;
    const raw = await runLLM(async () => {
      const response = await chatCompletion(systemPrompt, prompt, {
        model: "gpt-4o-mini",
        temperature: 0.2,
        maxTokens: 2000,
      });
      return response;
    }, estTokens);

    // Parse the response (similar to grant-matching's parseStrictOutput)
    const getInt = (label: string, max?: number) => {
      const rx = new RegExp(`${label}:\\s*(\\d+)`);
      const m = raw.match(rx);
      const n = m ? parseInt(m[1], 10) : 0;
      const clamped = max != null ? Math.min(Math.max(0, n), max) : n;
      return Number.isFinite(clamped) ? clamped : 0;
    };

    const total = getInt('Total Score', 100);
    const capabilityScore = getInt('Capability Match', 40);
    const experienceScore = getInt('Experience Match', 25);
    const locationScore = getInt('Location Match', 15);
    const certificationScore = getInt('Certification Match', 20);

    // Parse rationales
    const sectionMatch = raw.match(/Category Rationales:\s*([\s\S]*?)\n\s*Summary Explanation:/);
    const section = sectionMatch ? sectionMatch[1] : '';
    const grab = (label: string) => {
      const rx = new RegExp(`${label}:\\s*([\\s\\S]*?)(?:\n|$)`);
      const m = section.match(rx);
      return m ? m[1].trim() : '';
    };

    const summaryMatch = raw.match(/Summary Explanation:\s*([\s\S]*?)\nAlignment Rationale:/);
    const rationaleMatch = raw.match(/Alignment Rationale:\s*([\s\S]*)$/);

    const matchReasons: string[] = [];
    const capabilityRationale = grab('Capability Match');
    const experienceRationale = grab('Experience Match');
    const locationRationale = grab('Location Match');
    const certificationRationale = grab('Certification Match');

    if (capabilityScore > 20) matchReasons.push(capabilityRationale || 'Strong capability alignment');
    if (experienceScore > 12) matchReasons.push(experienceRationale || 'Relevant experience demonstrated');
    if (locationScore > 7) matchReasons.push(locationRationale || 'Good geographic fit');
    if (certificationScore > 10) matchReasons.push(certificationRationale || 'Certifications match requirements');

    const improvementSuggestions: string[] = [];
    if (capabilityScore < 20) improvementSuggestions.push('Enhance capability descriptions to better match tender requirements');
    if (experienceScore < 12) improvementSuggestions.push('Add more relevant past project examples');
    if (certificationScore < 10) improvementSuggestions.push('Obtain or highlight relevant certifications');

    return {
      overall_score: Math.max(0, Math.min(100, total)),
      capability_score: Math.max(0, Math.min(100, Math.round((capabilityScore / 40) * 100))),
      experience_score: Math.max(0, Math.min(100, Math.round((experienceScore / 25) * 100))),
      location_score: Math.max(0, Math.min(100, Math.round((locationScore / 15) * 100))),
      certification_score: Math.max(0, Math.min(100, Math.round((certificationScore / 20) * 100))),
      match_reasons: matchReasons.length > 0 ? matchReasons : ['Limited match - review details'],
      improvement_suggestions: improvementSuggestions.length > 0 ? improvementSuggestions : ['Profile alignment could be improved'],
      ai_analysis: {
        summary: summaryMatch ? summaryMatch[1].trim() : 'Match analysis completed',
        strengths: matchReasons,
        weaknesses: improvementSuggestions,
        recommendations: improvementSuggestions.length > 0 ? improvementSuggestions : ['Continue building relevant capabilities'],
      },
    };
  } catch (error) {
    console.error('Error in AI matching:', error);
    // Fallback to conservative scores
    return {
      overall_score: 30,
      capability_score: 20,
      experience_score: 15,
      location_score: 50,
      certification_score: 15,
      match_reasons: ['AI analysis unavailable - manual review recommended'],
      improvement_suggestions: ['Unable to generate suggestions'],
      ai_analysis: {
        summary: 'AI analysis failed - please review manually',
        strengths: [],
        weaknesses: ['Analysis unavailable'],
        recommendations: ['Manual review required'],
      },
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const {
      user,
      supabase,
      error: authError,
    } = await getAuthenticatedUser(request);
    if (!user) {
      console.error("Authentication failed:", authError);
      return apiError("Invalid or expired session. Please sign in again.", 401);
    }

    console.log("Starting tender matching for user:", user.id);

    // Get companyId from request body if provided
    const requestBody = await request.json().catch(() => ({}));
    const targetCompanyId = requestBody.companyId;

    let company;

    if (targetCompanyId) {
      // Use specific company if provided
      const { data: specificCompany, error: specificCompanyError } =
        await supabase
          .from("companies")
          .select("*")
          .eq("id", targetCompanyId)
          .eq("user_id", user.id)
          .eq("status", "active")
          .single();

      if (specificCompanyError || !specificCompany) {
        return apiError(
          `Company not found or access denied: ${targetCompanyId}`,
          404
        );
      }

      company = specificCompany;
    } else {
      // Get user's first active company if no specific company provided
      const { data: companies, error: companyError } = await supabase
        .from("companies")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1);

      if (companyError || !companies || companies.length === 0) {
        return apiError("No active company found for user", 404);
      }

      company = companies[0];
    }

    const companyData = company as CompanyData;
    console.log("Found company:", companyData.company_name);

    // Fetch company capabilities from junction table
    const { data: companyCapabilities } = await supabase
      .from("company_capabilities")
      .select("company_capabilities_ref(name, category)")
      .eq("company_id", companyData.id);

    const capabilityNames = (companyCapabilities || [])
      .map((cc: any) => cc.company_capabilities_ref?.name)
      .filter(Boolean)
      .join(" ");

    // Add capabilities to company data for matching
    if (capabilityNames) {
      companyData.key_capabilities = (companyData.key_capabilities || "") + " " + capabilityNames;
    }

    // Get open tenders that haven't been analyzed for this company recently (within last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentMatches } = await supabase
      .from("matching_results")
      .select("tender_id")
      .eq("company_id", companyData.id)
      .gte("updated_at", sevenDaysAgo.toISOString());

    const recentlyAnalyzedTenderIds =
      recentMatches?.map((m) => m.tender_id) || [];

    let tendersQuery = supabase
      .from("tenders")
      .select("*")
      .in("status", ["open", "closing_soon", "framework"]);

    // Only skip recently analyzed tenders (within 7 days)
    if (recentlyAnalyzedTenderIds.length > 0) {
      tendersQuery = tendersQuery.not(
        "id",
        "in",
        `(${recentlyAnalyzedTenderIds.map((id) => `"${id}"`).join(",")})`
      );
    }

    const { data: tenders, error: tendersError } = await tendersQuery;

    if (tendersError) {
      return apiError(`Failed to fetch tenders: ${tendersError.message}`, 500);
    }

    if (!tenders || tenders.length === 0) {
      return apiResponse({
        message: "All tenders are up to date - no new tenders to analyze",
        analyzed_count: 0,
        up_to_date: true,
      });
    }

    console.log(`Found ${tenders.length} tenders to analyze`);

    const results: {
      tender_id: string;
      tender_title: string;
      overall_score: number;
    }[] = [];

    // Analyze each tender
    for (const tender of tenders as TenderData[]) {
      try {
        console.log(`Analyzing tender: ${tender.title}`);

        const analysis = await analyzeTenderMatch(companyData, tender);

        // Save to database using upsert to handle duplicates
        const { error: insertError } = await supabase
          .from("matching_results")
          .upsert(
            {
              company_id: companyData.id,
              tender_id: tender.id,
              overall_score: analysis.overall_score,
              capability_score: analysis.capability_score,
              experience_score: analysis.experience_score,
              location_score: analysis.location_score,
              certification_score: analysis.certification_score,
              match_reasons: analysis.match_reasons,
              improvement_suggestions: analysis.improvement_suggestions,
              ai_analysis: analysis.ai_analysis,
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: "company_id,tender_id",
            }
          );

        if (insertError) {
          console.error("Failed to save analysis:", insertError);
        } else {
          results.push({
            tender_id: tender.id,
            tender_title: tender.title,
            overall_score: analysis.overall_score,
          });
        }
      } catch (error) {
        console.error(`Failed to analyze tender ${tender.id}:`, error);
      }
    }

    // Log matching completion
    await logApiEvent(request, {
      actionType: "matching_completed",
      userId: user?.id || null,
      userEmail: user?.email || undefined,
      entityType: "company",
      entityId: companyData.id,
      details: {
        analyzedCount: results.length,
        companyName: companyData.company_name,
      },
    }).catch(() => {});

    return apiResponse({
      message: "Tender analysis completed",
      analyzed_count: results.length,
      results,
    });
  } catch (error) {
    console.error("Error in match-tenders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
