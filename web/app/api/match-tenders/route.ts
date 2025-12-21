import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  chatCompletion,
  parseAIJsonResponse,
  apiResponse,
  apiError,
} from "@/lib/api";
import type { TenderMatchResult } from "@/lib/api/types";

interface CompanyData {
  id: string;
  company_name: string;
  description: string | null;
  key_capabilities: string | null;
  location: string | null;
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

async function analyzeTenderMatch(
  company: CompanyData,
  tender: TenderData
): Promise<TenderMatchResult> {
  const prompt = `
You are an expert in construction tender matching. Analyze how well this company matches this tender opportunity.

COMPANY PROFILE:
- Name: ${company.company_name}
- Description: ${company.description || "Not provided"}
- Key Capabilities: ${company.key_capabilities || "Not provided"}
- Location: ${company.postcode || company.location || "Not provided"}
- Past Projects: ${company.past_projects || "Not provided"}
- Certifications: ${company.certifications || "Not provided"}
- Equipment: ${company.equipment || "Not provided"}
- Safety Rating: ${company.safety_rating || "Not provided"}
- Digital Maturity: ${company.digital_maturity || "Not provided"}

TENDER OPPORTUNITY:
- Title: ${tender.title}
- Description: ${tender.description || "Not provided"}
- Buyer: ${tender.buyer}
- Location: ${tender.location || "Not provided"}
- Budget: ${tender.budget_min && tender.budget_max ? `£${tender.budget_min} - £${tender.budget_max}` : "Not specified"}
- Deadline: ${tender.deadline || "Not specified"}
- CPV Codes: ${tender.cpv_codes?.join(", ") || "Not provided"}
- Requirements: ${JSON.stringify(tender.requirements) || "Not provided"}

Please provide a detailed analysis with scores (0-100) for:
1. Overall Match Score
2. Capability Match Score
3. Experience Match Score
4. Location Match Score
5. Certification Match Score

Also provide:
- 3-5 key match reasons
- 3-5 improvement suggestions
- A summary of strengths and weaknesses

Respond in valid JSON format only:
{
  "overall_score": number,
  "capability_score": number,
  "experience_score": number,
  "location_score": number,
  "certification_score": number,
  "match_reasons": ["reason1", "reason2", ...],
  "improvement_suggestions": ["suggestion1", "suggestion2", ...],
  "ai_analysis": {
    "summary": "Brief summary of the match",
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "recommendations": ["rec1", "rec2", ...]
  }
}`;

  const systemPrompt =
    "You are a construction industry expert specializing in tender matching analysis. Always respond with valid JSON only.";

  const response = await chatCompletion(systemPrompt, prompt, {
    temperature: 0.3,
    maxTokens: 2000,
  });

  return parseAIJsonResponse<TenderMatchResult>(response);
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
