import { createAdminClient, chatCompletion, parseAIJsonResponse } from "@/lib/api";
import { runLLM } from "./llmLimiter";

const supabase = createAdminClient();

export interface MatchingScore {
  overallScore: number;
  capabilityScore: number;
  experienceScore: number;
  locationScore: number;
  certificationScore: number;
  matchReasons: string[];
  improvementSuggestions: string[];
  aiAnalysis: string;
  scoreExplanations?: {
    capability: string;
    experience: string;
    location: string;
    certification: string;
  };
}

/**
 * Score a tender match for a company
 */
export async function scoreTenderMatch(
  companyId: string,
  tenderId: string
): Promise<MatchingScore> {
  // Fetch company data with AI-generated summary and taxonomy
  const { data: company, error: companyError } = await (supabase
    .from("companies" as any)
    .select("company_name, description, ai_summary, ai_capability_taxonomy, key_capabilities, certifications, past_projects, postcode")
    .eq("id", companyId)
    .single());

  if (companyError || !company) {
    throw new Error(`Failed to fetch company: ${companyError?.message || "Company not found"}`);
  }

  const companyData = company as unknown as {
    company_name: string | null;
    description: string | null;
    ai_summary: string | null;
    ai_capability_taxonomy: string[] | null;
    key_capabilities: string | null;
    certifications: string | null;
    past_projects: string | null;
    postcode: string | null;
  };

  // Fetch tender data with AI-generated summary and taxonomy
  const { data: tender, error: tenderError } = await (supabase
    .from("tenders" as any)
    .select("title, description, ai_summary, ai_capability_taxonomy, buyer, budget_min, budget_max, deadline, location, cpv_codes, requirements")
    .eq("id", tenderId)
    .single());

  if (tenderError || !tender) {
    throw new Error(`Failed to fetch tender: ${tenderError?.message || "Tender not found"}`);
  }

  const tenderData = tender as unknown as {
    title: string | null;
    description: string | null;
    ai_summary: string | null;
    ai_capability_taxonomy: string[] | null;
    buyer: string | null;
    budget_min: number | null;
    budget_max: number | null;
    deadline: string | null;
    location: string | null;
    cpv_codes: string[] | null;
    requirements: unknown;
  };

  // Format budget range
  const budgetRange = tenderData.budget_min || tenderData.budget_max
    ? `£${tenderData.budget_min ? tenderData.budget_min.toLocaleString() : "?"} - £${tenderData.budget_max ? tenderData.budget_max.toLocaleString() : "?"}`
    : "Not specified";

  // Check data completeness for company
  const hasCapabilities = !!(companyData.key_capabilities && companyData.key_capabilities.trim().length > 10) || 
                          !!(companyData.ai_capability_taxonomy && companyData.ai_capability_taxonomy.length > 0);
  const hasExperience = !!(companyData.past_projects && companyData.past_projects.trim().length > 20);
  const hasCertifications = !!(companyData.certifications && companyData.certifications.trim().length > 5);
  const hasLocation = !!companyData.postcode;
  const hasDescription = !!(companyData.description && companyData.description.trim().length > 20);
  
  const dataPoints = [hasCapabilities, hasExperience, hasCertifications, hasLocation, hasDescription].filter(Boolean).length;
  const isMinimalData = dataPoints < 3;

  const systemPrompt = `You are an expert at evaluating company-tender matches. FIRST: Check if company and tender industries/sectors match (e.g., construction, healthcare, IT, telecom). If industries DON'T MATCH, set capabilityScore = 0 immediately. If industries match, rate capability relevance 0-100. Then rate Certification, Experience, Location 0-100 independently. No assumptions. Return JSON with capabilityScore, experienceScore, locationScore, certificationScore, matchReasons, improvementSuggestions, aiAnalysis, and scoreExplanations.`;

  const userPrompt = `Company: ${companyData.company_name || "N/A"}
${hasDescription ? `Description: ${companyData.description}` : "Description: NOT PROVIDED"}
${hasCapabilities ? (companyData.key_capabilities ? `Capabilities: ${companyData.key_capabilities}` : "") : "Capabilities: NOT PROVIDED"}
${hasCertifications ? `Certifications: ${companyData.certifications}` : "Certifications: NOT PROVIDED"}
${hasExperience ? `Past Projects: ${companyData.past_projects}` : "Past Projects: NOT PROVIDED"}
${hasLocation ? `Location: ${companyData.postcode}` : "Location: NOT PROVIDED"}

Tender: ${tenderData.title || "N/A"}
Description: ${tenderData.description || "N/A"}
Buyer: ${tenderData.buyer || "N/A"}
Budget: ${budgetRange}
Location: ${tenderData.location || "N/A"}
${tenderData.cpv_codes && tenderData.cpv_codes.length > 0 ? `CPV Codes: ${tenderData.cpv_codes.join(", ")}` : ""}

FIRST: Check if industries match. If NO → capabilityScore = 0. If YES → rate capability 0-100. Then rate certification, experience, location 0-100.`;

  // Log the prompt for debugging
  console.log("\n" + "=".repeat(80));
  console.log(`📋 TENDER MATCHING PROMPT: ${companyData.company_name} → ${tenderData.title}`);
  console.log("=".repeat(80));
  console.log("\n🔹 SYSTEM PROMPT:");
  console.log(systemPrompt);
  console.log("\n🔹 USER PROMPT:");
  console.log(userPrompt);
  console.log("\n" + "=".repeat(80) + "\n");

  // Call OpenAI with rate limiting
  let response: string;
  try {
    response = await runLLM(
      async () => {
        console.log("📞 Calling OpenAI API...");
        const aiResponse = await chatCompletion(systemPrompt, userPrompt, {
          model: "gpt-5-mini",
          maxTokens: 8000, // Increased to allow for default reasoning tokens plus output
          responseFormat: "json_object", // Request JSON output format
        });
        console.log(`📥 Received response (${aiResponse.length} chars)`);
        if (aiResponse.length === 0) {
          console.error("⚠️ WARNING: OpenAI returned empty response!");
        }
        return aiResponse;
      },
      4000 // Estimated tokens
    );
  } catch (error: any) {
    console.error("❌ Error calling OpenAI API:", error);
    console.error("Error details:", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      stack: error?.stack,
    });
    throw error;
  }

  // Log the AI response
  console.log("\n" + "=".repeat(80));
  console.log(`🤖 AI RESPONSE FOR TENDER MATCHING: ${companyData.company_name} → ${tenderData.title}`);
  console.log("=".repeat(80));
  console.log(response);
  console.log("\n" + "=".repeat(80) + "\n");

  // Parse AI response
  let score: MatchingScore;

  // Log the raw response for debugging
  console.log("\n" + "=".repeat(80));
  console.log(`📄 RAW AI RESPONSE (${response.length} chars):`);
  console.log("=".repeat(80));
  console.log(response);
  console.log("=".repeat(80) + "\n");

  try {
    // Use the parseAIJsonResponse helper which handles markdown code blocks and comments
    let parsed;
    try {
      parsed = parseAIJsonResponse(response);
    } catch (parseError) {
      // Fallback to simple regex if parseAIJsonResponse fails
      console.warn("parseAIJsonResponse failed, trying regex fallback:", parseError);
      console.warn("Response length:", response.length);
      console.warn("Response preview (first 1000 chars):", response.substring(0, 1000));
      
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (regexParseError) {
          console.error("Regex match found but JSON.parse failed. Matched content:", jsonMatch[0].substring(0, 500));
          throw new Error(`Failed to parse JSON from response. Response length: ${response.length}. Preview: ${response.substring(0, 1000)}`);
        }
      } else {
        console.error("No JSON pattern found in response. Full response:", response);
        throw new Error(`No JSON found in response. Response length: ${response.length}. Full response: ${response}`);
      }
    }
    
    if (parsed) {
      
      // Get scores from AI (no overallScore from AI - we calculate it)
      let capabilityScore = Math.max(0, Math.min(100, parsed.capabilityScore || 0));
      let experienceScore = Math.max(0, Math.min(100, parsed.experienceScore || 0));
      let certificationScore = Math.max(0, Math.min(100, parsed.certificationScore || 0));
      let locationScore = Math.max(0, Math.min(100, parsed.locationScore || 0));
      
      // Enforce rules based on data completeness - mark 0 if data is missing
      if (!hasCapabilities) {
        capabilityScore = 0;
      }
      
      if (!hasExperience) {
        experienceScore = 0;
      }
      
      if (!hasCertifications) {
        certificationScore = 0;
      }
      
      if (!hasLocation) {
        locationScore = 0;
      }
      
      // Calculate overall score locally using weights
      // Capability MUST MATCH - it's a gate, not a weight
      // If capability doesn't match (< 50), overall score is 0
      let overallScore = 0;
      if (capabilityScore >= 50) {
        // If capability matches, calculate based on other factors only
        // Weights: Certification 50%, Experience 40%, Location 10% = 100%
        overallScore = Math.round(
          (certificationScore * 0.5) + 
          (experienceScore * 0.4) + 
          (locationScore * 0.1)
        );
      }
      
      const scoreExplanations = parsed.scoreExplanations || {};
      
      // Override explanations when we force scores to 0
      const finalScoreExplanations = {
        capability: !hasCapabilities ? "No capabilities listed - score set to 0" : (scoreExplanations.capability || `Capability score: ${capabilityScore}%`),
        experience: !hasExperience ? "No past projects listed - score set to 0" : (scoreExplanations.experience || `Experience score: ${experienceScore}%`),
        location: !hasLocation ? "Location not provided - score set to 0. Do not assume location." : (scoreExplanations.location || `Location score: ${locationScore}%`),
        certification: !hasCertifications ? "No certifications listed - score set to 0" : (scoreExplanations.certification || `Certification score: ${certificationScore}%`),
      };
      
      score = {
        overallScore,
        capabilityScore,
        experienceScore,
        locationScore,
        certificationScore,
        matchReasons: Array.isArray(parsed.matchReasons) ? parsed.matchReasons : [],
        improvementSuggestions: Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : [],
        aiAnalysis: parsed.aiAnalysis || response,
        scoreExplanations: finalScoreExplanations,
      };
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (e) {
    console.error("Failed to parse AI response for matching:", e);
    // Fallback to conservative default scores based on data
    const fallbackCapability = hasCapabilities ? 50 : 0;
    const fallbackExperience = hasExperience ? 50 : 0;
    const fallbackCertification = hasCertifications ? 50 : 0;
    const fallbackLocation = hasLocation ? 50 : 0;
    
    // Capability MUST MATCH - if it doesn't, overall is 0
    let fallbackOverall = 0;
    if (fallbackCapability >= 50) {
      // If capability matches, calculate: Certification 50%, Experience 40%, Location 10%
      fallbackOverall = Math.round(
        (fallbackCertification * 0.5) + 
        (fallbackExperience * 0.4) + 
        (fallbackLocation * 0.1)
      );
    }
    
    score = {
      overallScore: fallbackOverall,
      capabilityScore: fallbackCapability,
      experienceScore: fallbackExperience,
      locationScore: fallbackLocation,
      certificationScore: fallbackCertification,
      matchReasons: ["AI analysis unavailable"],
      improvementSuggestions: ["Unable to generate suggestions"],
      aiAnalysis: response,
      scoreExplanations: {
        capability: "Analysis unavailable",
        experience: "Analysis unavailable",
        location: "Analysis unavailable",
        certification: "Analysis unavailable",
      },
    };
  }

  // Store or update matching result
  const { error: upsertError } = await (supabase
    .from("matching_results" as any)
    .upsert(
      {
        company_id: companyId,
        tender_id: tenderId,
        overall_score: score.overallScore,
        capability_score: score.capabilityScore,
        experience_score: score.experienceScore,
        location_score: score.locationScore,
        certification_score: score.certificationScore,
        match_reasons: score.matchReasons,
        improvement_suggestions: score.improvementSuggestions,
        ai_analysis: {
          analysis: score.aiAnalysis,
          generated_at: new Date().toISOString(),
          score_explanations: score.scoreExplanations || {
            capability: `Capability score: ${score.capabilityScore}%`,
            experience: `Experience score: ${score.experienceScore}%`,
            location: `Location score: ${score.locationScore}%`,
            certification: `Certification score: ${score.certificationScore}%`,
          },
        },
        updated_at: new Date().toISOString(),
      } as any,
      {
        onConflict: "company_id,tender_id",
      }
    ));

  if (upsertError) {
    throw new Error(`Failed to store matching result: ${upsertError.message}`);
  }

  return score;
}

/**
 * Batch score tenders for a company
 * This queues matching jobs rather than processing immediately
 */
export async function batchScoreTendersForCompany(
  companyId: string,
  tenderIds?: string[]
): Promise<{ jobCount: number; batchId: string }> {
  // If no tender IDs provided, fetch all open tenders
  let tendersToMatch: string[] = [];

  if (tenderIds && tenderIds.length > 0) {
    tendersToMatch = tenderIds;
  } else {
    const { data: openTenders, error } = await supabase
      .from("tenders")
      .select("id")
      .in("status", ["open", "closing_soon"]);

    if (error) {
      throw new Error(`Failed to fetch open tenders: ${error.message}`);
    }

    tendersToMatch = (openTenders || []).map((t: { id: string }) => t.id);
  }

  // Queue matching jobs (this will be handled by the queue service)
  const { enqueueBatch } = await import("./queueService");

  const jobs = tendersToMatch.map((tenderId) => ({
    jobType: "tender_matching" as const,
    entityType: "tender" as const,
    entityId: tenderId,
    companyId,
    tenderId,
    priority: 10, // High priority for user-triggered matching
  }));

  const { batchId } = await enqueueBatch(jobs, "company_matching", undefined, companyId);

  return { jobCount: jobs.length, batchId };
}
