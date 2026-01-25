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
import { enqueueBatch } from "@/lib/services/queueService";
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
  tender: TenderData,
): Promise<TenderMatchResult> {
  // Check data completeness
  const hasCapabilities = !!(
    company.key_capabilities && company.key_capabilities.trim().length > 10
  );
  const hasExperience = !!(
    company.past_projects && company.past_projects.trim().length > 20
  );
  const hasCertifications = !!(
    company.certifications && company.certifications.trim().length > 5
  );
  const hasLocation = !!(company.postcode || company.location);

  // Build company profile text (like grant-matching builds researcher profile)
  const companyProfile = [
    `Company: ${company.company_name}`,
    company.description ? `Description: ${company.description}` : "",
    hasCapabilities
      ? `Capabilities: ${company.key_capabilities}`
      : "Capabilities: NOT PROVIDED",
    hasExperience
      ? `Past Projects: ${company.past_projects}`
      : "Past Projects: NOT PROVIDED",
    hasCertifications
      ? `Certifications: ${company.certifications}`
      : "Certifications: NOT PROVIDED",
    company.equipment ? `Equipment: ${company.equipment}` : "",
    hasLocation
      ? `Location: ${company.postcode || company.location}`
      : "Location: NOT PROVIDED",
  ]
    .filter(Boolean)
    .join("\n");

  // Build tender information (like grant-matching's grant info)
  const tenderInfo = [
    `Title: ${tender.title}`,
    tender.description ? `Description: ${tender.description}` : "",
    `Buyer: ${tender.buyer}`,
    tender.location ? `Location: ${tender.location}` : "",
    tender.budget_min && tender.budget_max
      ? `Budget: £${tender.budget_min.toLocaleString()} - £${tender.budget_max.toLocaleString()}`
      : tender.budget_min
        ? `Budget: £${tender.budget_min.toLocaleString()}+`
        : tender.budget_max
          ? `Budget: Up to £${tender.budget_max.toLocaleString()}`
          : "",
    tender.deadline
      ? `Deadline: ${new Date(tender.deadline).toLocaleDateString()}`
      : "",
    tender.cpv_codes && tender.cpv_codes.length > 0
      ? `CPV Codes: ${tender.cpv_codes.join(", ")}`
      : "",
    tender.requirements
      ? `Requirements: ${JSON.stringify(tender.requirements)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `You are an expert at evaluating company-tender matches. FIRST: Check if company and tender industries/sectors match (e.g., construction, healthcare, IT, telecom). If industries DON'T MATCH, set capabilityScore = 0 immediately. If industries match, rate capability relevance 0-100. Then rate Certification, Experience, Location 0-100 independently. No assumptions. Return JSON with capabilityScore, experienceScore, locationScore, certificationScore, matchReasons, improvementSuggestions, aiAnalysis, and scoreExplanations.`;

  const prompt = `Company: ${companyProfile}

Tender: ${tenderInfo}

FIRST: Check if industries match. If NO → capabilityScore = 0. If YES → rate capability 0-100. Then rate certification, experience, location 0-100. Return JSON with scores and explanations.`;

  // Log the full prompt for debugging
  console.log("\n" + "=".repeat(80));
  console.log("📋 TENDER MATCHING PROMPT BEING SENT TO AI:");
  console.log("=".repeat(80));
  console.log("\n🔹 SYSTEM PROMPT:");
  console.log(systemPrompt);
  console.log("\n🔹 ANALYSIS PROMPT:");
  console.log(prompt);
  console.log("\n" + "=".repeat(80) + "\n");

  try {
    const estTokens =
      Math.ceil(
        (prompt.length + companyProfile.length + tenderInfo.length) / 4,
      ) + 400;
    const raw = await runLLM(async () => {
      const response = await chatCompletion(systemPrompt, prompt, {
        model: "gpt-5-mini",
        temperature: 0.2,
        maxTokens: 2000,
      });
      return response;
    }, estTokens);

    // Log the AI response
    console.log("\n" + "=".repeat(80));
    console.log("🤖 AI RESPONSE FOR TENDER MATCHING:");
    console.log("=".repeat(80));
    console.log(raw);
    console.log("\n" + "=".repeat(80) + "\n");

    // Parse JSON response
    let parsed: any;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${e}`);
    }

    let capabilityScore = Math.max(
      0,
      Math.min(100, parsed.capabilityScore || 0),
    );
    let experienceScore = Math.max(
      0,
      Math.min(100, parsed.experienceScore || 0),
    );
    let locationScore = Math.max(0, Math.min(100, parsed.locationScore || 0));
    let certificationScore = Math.max(
      0,
      Math.min(100, parsed.certificationScore || 0),
    );

    // Enforce: mark 0 if data is missing
    if (!hasCapabilities) capabilityScore = 0;
    if (!hasExperience) experienceScore = 0;
    if (!hasCertifications) certificationScore = 0;
    if (!hasLocation) locationScore = 0;

    // Calculate overall score locally using weights
    // Capability MUST MATCH - it's a gate, not a weight
    // If capability doesn't match (< 50), overall score is 0
    let weightedTotal = 0;
    if (capabilityScore >= 50) {
      // If capability matches, calculate based on other factors only
      // Weights: Certification 50%, Experience 40%, Location 10% = 100%
      weightedTotal = Math.round(
        certificationScore * 0.5 + experienceScore * 0.4 + locationScore * 0.1,
      );
    }

    // Get explanations from parsed JSON
    const scoreExplanations = parsed.scoreExplanations || {};
    const matchReasons = Array.isArray(parsed.matchReasons)
      ? parsed.matchReasons
      : [];
    const improvementSuggestions = Array.isArray(parsed.improvementSuggestions)
      ? parsed.improvementSuggestions
      : [];

    // Override explanations when we force scores to 0
    const finalScoreExplanations = {
      capability: !hasCapabilities
        ? "No capabilities listed - score set to 0"
        : scoreExplanations.capability ||
          `Capability score: ${capabilityScore}%`,
      experience: !hasExperience
        ? "No past projects listed - score set to 0"
        : scoreExplanations.experience ||
          `Experience score: ${experienceScore}%`,
      location: !hasLocation
        ? "Location not provided - score set to 0. Do not assume location."
        : scoreExplanations.location || `Location score: ${locationScore}%`,
      certification: !hasCertifications
        ? "No certifications listed - score set to 0"
        : scoreExplanations.certification ||
          `Certification score: ${certificationScore}%`,
    };

    return {
      overall_score: Math.max(0, Math.min(100, weightedTotal)),
      capability_score: Math.max(0, Math.min(100, capabilityScore)),
      experience_score: Math.max(0, Math.min(100, experienceScore)),
      location_score: Math.max(0, Math.min(100, locationScore)),
      certification_score: Math.max(0, Math.min(100, certificationScore)),
      match_reasons:
        matchReasons.length > 0
          ? matchReasons
          : ["Limited match - review details"],
      improvement_suggestions:
        improvementSuggestions.length > 0
          ? improvementSuggestions
          : ["Profile alignment could be improved"],
      ai_analysis: {
        summary: parsed.aiAnalysis || "Match analysis completed",
        strengths: matchReasons,
        weaknesses: improvementSuggestions,
        recommendations:
          improvementSuggestions.length > 0
            ? improvementSuggestions
            : ["Continue building relevant capabilities"],
        score_explanations: finalScoreExplanations,
      },
    };
  } catch (error) {
    console.error("Error in AI matching:", error);
    // Fallback to conservative scores - mark 0 if data is missing
    const fallbackCapability = hasCapabilities ? 50 : 0;
    const fallbackExperience = hasExperience ? 50 : 0;
    const fallbackCertification = hasCertifications ? 50 : 0;
    const fallbackLocation = hasLocation ? 50 : 0;

    // Capability MUST MATCH - if it doesn't, overall is 0
    let fallbackOverall = 0;
    if (fallbackCapability >= 50) {
      // If capability matches, calculate: Certification 50%, Experience 40%, Location 10%
      fallbackOverall = Math.round(
        fallbackCertification * 0.5 +
          fallbackExperience * 0.4 +
          fallbackLocation * 0.1,
      );
    }

    return {
      overall_score: fallbackOverall,
      capability_score: fallbackCapability,
      experience_score: fallbackExperience,
      location_score: fallbackLocation,
      certification_score: fallbackCertification,
      match_reasons: ["AI analysis unavailable - manual review recommended"],
      improvement_suggestions: ["Unable to generate suggestions"],
      ai_analysis: {
        summary: "AI analysis failed - please review manually",
        strengths: [],
        weaknesses: ["Analysis unavailable"],
        recommendations: ["Manual review required"],
        score_explanations: {
          capability: "Analysis unavailable",
          experience: "Analysis unavailable",
          location: "Analysis unavailable",
          certification: "Analysis unavailable",
        },
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
          404,
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
      companyData.key_capabilities =
        (companyData.key_capabilities || "") + " " + capabilityNames;
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
        `(${recentlyAnalyzedTenderIds.map((id) => `"${id}"`).join(",")})`,
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

    // Queue matching jobs instead of processing directly
    const jobs = (tenders as TenderData[]).map((tender) => ({
      jobType: "tender_matching" as const,
      entityType: "tender" as const,
      entityId: tender.id,
      companyId: companyData.id,
      tenderId: tender.id,
      priority: 5,
    }));

    // Create batch and queue all jobs
    const { batchId, jobIds } = await enqueueBatch(
      jobs,
      "tender_matching",
      user.id,
      companyData.id,
    );

    console.log(`✅ Queued ${jobs.length} matching jobs in batch ${batchId}`);

    // Trigger queue worker to start processing (non-blocking)
    fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/queue/worker`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchSize: 50,
          continuous: true,
          concurrency: 15,
        }),
      },
    ).catch((err) => {
      console.error("Failed to trigger queue worker:", err);
      // Don't fail the request if worker trigger fails
    });

    // Log matching start
    await logApiEvent(request, {
      actionType: "matching_started",
      userId: user?.id || null,
      userEmail: user?.email || undefined,
      entityType: "company",
      entityId: companyData.id,
      details: {
        batchId,
        totalTenders: tenders.length,
        companyName: companyData.company_name,
      },
    }).catch(() => {});

    return apiResponse({
      message: "Tender matching started",
      batch_id: batchId,
      total_tenders: tenders.length,
      queued_jobs: jobIds.length,
    });
  } catch (error) {
    console.error("Error in match-tenders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
