import { createAdminClient, chatCompletion } from "@/lib/api";
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

  const systemPrompt = `You are an expert at evaluating how well companies match tender opportunities.
Analyze the company profile against the tender requirements and provide a comprehensive scoring.

CRITICAL SCORING RULES:
1. CAPABILITIES ARE THE MOST IMPORTANT FACTOR - If the company has no capabilities listed (key_capabilities is empty/N/A and ai_capability_taxonomy is empty), the capabilityScore MUST be 0-30, regardless of description.
2. DATA COMPLETENESS MATTERS - If the company profile has minimal data (less than 3 data points: capabilities, experience, certifications, location, description), you MUST score conservatively:
   - overallScore: 30-50 (never above 50 with minimal data)
   - capabilityScore: 0-40 if no capabilities listed
   - experienceScore: 0-30 if no past projects listed
   - certificationScore: 0-30 if no certifications listed
3. DESCRIPTION IS LEAST IMPORTANT - A description alone without capabilities, experience, or certifications should NOT result in a high score.
4. WEIGHTING: capabilityScore (40%) > experienceScore (25%) > certificationScore (20%) > locationScore (10%) > description (5%)

Return a JSON object with the following structure:
{
  "overallScore": <number 0-100>,
  "capabilityScore": <number 0-100>,
  "experienceScore": <number 0-100>,
  "locationScore": <number 0-100>,
  "certificationScore": <number 0-100>,
  "matchReasons": [<array of strings explaining why this is a good match>],
  "improvementSuggestions": [<array of strings with actionable suggestions>],
  "aiAnalysis": "<detailed analysis text explaining the match>"
}

Scoring guidelines:
- capabilityScore: How well company capabilities match tender requirements. MUST be 0-30 if no capabilities are listed.
- experienceScore: How relevant company's past projects/experience are. MUST be 0-30 if no past projects listed.
- locationScore: Geographic fit (if location matters). Can be 50 if location not specified.
- certificationScore: How well company certifications match requirements. MUST be 0-30 if no certifications listed.
- overallScore: Weighted average: capabilityScore*0.4 + experienceScore*0.25 + certificationScore*0.2 + locationScore*0.1 + (description relevance)*0.05

If the company has minimal data (less than 3 data points), the overallScore MUST be between 30-50, never higher.

Be honest and conservative in your assessment. Do not inflate scores based on description alone.`;

  const userPrompt = `Company Profile:
Name: ${companyData.company_name || "N/A"}
${hasDescription ? `Description: ${companyData.description}` : "Description: NOT PROVIDED"}
${companyData.ai_summary ? `AI Summary: ${companyData.ai_summary}` : ""}
${hasCapabilities ? (companyData.key_capabilities ? `Key Capabilities: ${companyData.key_capabilities}` : "") : "Key Capabilities: NOT PROVIDED"}
${hasCapabilities && companyData.ai_capability_taxonomy ? `Capability Taxonomy: ${JSON.stringify(companyData.ai_capability_taxonomy)}` : ""}
${hasCertifications ? `Certifications: ${companyData.certifications}` : "Certifications: NOT PROVIDED"}
${hasExperience ? `Past Projects: ${companyData.past_projects}` : "Past Projects: NOT PROVIDED"}
${hasLocation ? `Location: ${companyData.postcode}` : "Location: NOT PROVIDED"}

DATA COMPLETENESS: ${dataPoints} out of 5 data points available. ${isMinimalData ? "WARNING: Minimal data - score conservatively (30-50 max)." : "Sufficient data available."}

Tender Opportunity:
Title: ${tenderData.title || "N/A"}
Description: ${tenderData.description || "N/A"}
${tenderData.ai_summary ? `AI Summary: ${tenderData.ai_summary}` : ""}
Buyer: ${tenderData.buyer || "N/A"}
Budget: ${budgetRange}
Deadline: ${tenderData.deadline || "N/A"}
Location: ${tenderData.location || "N/A"}
${tenderData.cpv_codes && tenderData.cpv_codes.length > 0 ? `CPV Codes: ${tenderData.cpv_codes.join(", ")}` : ""}
${tenderData.requirements ? `Requirements: ${typeof tenderData.requirements === "string" ? tenderData.requirements : JSON.stringify(tenderData.requirements)}` : ""}
${tenderData.ai_capability_taxonomy ? `Required Capability Taxonomy: ${JSON.stringify(tenderData.ai_capability_taxonomy)}` : ""}

Evaluate how well this company matches this tender opportunity. 
${!hasCapabilities ? "CRITICAL: Company has NO capabilities listed. capabilityScore MUST be 0-30." : ""}
${isMinimalData ? "CRITICAL: Company has minimal data. overallScore MUST be 30-50, never higher." : ""}
Return the JSON scoring object following the scoring rules.`;

  // Call OpenAI with rate limiting
  const response = await runLLM(
    async () => {
      const aiResponse = await chatCompletion(systemPrompt, userPrompt, {
        model: "gpt-4o-mini",
        temperature: 0.3,
        maxTokens: 2000,
      });
      return aiResponse;
    },
    4000 // Estimated tokens
  );

  // Parse AI response
  let score: MatchingScore;

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Enforce conservative scoring for minimal data
      let overallScore = Math.max(0, Math.min(100, parsed.overallScore || 0));
      let capabilityScore = Math.max(0, Math.min(100, parsed.capabilityScore || 0));
      let experienceScore = Math.max(0, Math.min(100, parsed.experienceScore || 0));
      let certificationScore = Math.max(0, Math.min(100, parsed.certificationScore || 0));
      let locationScore = Math.max(0, Math.min(100, parsed.locationScore || 50)); // Default to 50 if not specified
      
      // Enforce rules based on data completeness
      if (!hasCapabilities) {
        capabilityScore = Math.min(capabilityScore, 30);
      }
      
      if (!hasExperience) {
        experienceScore = Math.min(experienceScore, 30);
      }
      
      if (!hasCertifications) {
        certificationScore = Math.min(certificationScore, 30);
      }
      
      // If minimal data, cap overall score at 50
      if (isMinimalData) {
        overallScore = Math.min(overallScore, 50);
        // Recalculate based on weighted average if AI didn't follow rules
        const weightedScore = (capabilityScore * 0.4) + (experienceScore * 0.25) + (certificationScore * 0.2) + (locationScore * 0.1) + (hasDescription ? 5 : 0);
        overallScore = Math.min(overallScore, weightedScore, 50);
      }
      
      // Warn if AI scored too high with minimal data
      if (isMinimalData && overallScore > 50) {
        console.warn(`⚠️ AI scored ${overallScore}% with minimal data (${dataPoints} data points). Capping at 50%.`);
        overallScore = 50;
      }
      
      score = {
        overallScore,
        capabilityScore,
        experienceScore,
        locationScore,
        certificationScore,
        matchReasons: Array.isArray(parsed.matchReasons) ? parsed.matchReasons : [],
        improvementSuggestions: Array.isArray(parsed.improvementSuggestions) ? parsed.improvementSuggestions : [],
        aiAnalysis: parsed.aiAnalysis || response,
      };
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (e) {
    console.error("Failed to parse AI response for matching:", e);
    // Fallback to conservative default scores based on data
    score = {
      overallScore: isMinimalData ? 40 : 50,
      capabilityScore: hasCapabilities ? 50 : 20,
      experienceScore: hasExperience ? 50 : 20,
      locationScore: hasLocation ? 50 : 50,
      certificationScore: hasCertifications ? 50 : 20,
      matchReasons: ["AI analysis unavailable"],
      improvementSuggestions: ["Unable to generate suggestions"],
      aiAnalysis: response,
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
