 
import { type MatchingModelId } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { matchingScoreSchema } from "@/lib/schemas/tenderMatching";
import { db } from "@/lib/db";
import { companies, tenders, matchingResults } from "@/lib/db/schema/app";
import { eq, inArray, sql } from "drizzle-orm";

/** Reasoning effort for GPT-5 models: lower = faster, fewer reasoning tokens. */
export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface ScoreTenderMatchOptions {
  demo?: boolean;
  model?: MatchingModelId;
  batchLabel?: string;
  /** GPT-5 nano only: reduce thinking for faster/cheaper runs (e.g. "low", "minimal", "none"). */
  reasoningEffort?: ReasoningEffort;
}

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
 * Score a tender match for a company.
 * When options.demo is true, writes to demo_matching_results and uses options.model (else platform default).
 */
export async function scoreTenderMatch(
  companyId: string,
  tenderId: string,
  options?: ScoreTenderMatchOptions,
): Promise<MatchingScore> {
  const model: string | undefined = options?.model;
  const isDemo = options?.demo === true;
  const batchLabel = options?.batchLabel ?? "User A";
  // Fetch company data with AI-generated summary and taxonomy
  const companyRows = await db
    .select({
      companyName: companies.companyName,
      description: companies.description,
      aiSummary: companies.aiSummary,
      aiCapabilityTaxonomy: companies.aiCapabilityTaxonomy,
      keyCapabilities: companies.keyCapabilities,
      certifications: companies.certifications,
      pastProjects: companies.pastProjects,
      postcode: companies.postcode,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const companyData = companyRows[0];
  if (!companyData) {
    throw new Error("Failed to fetch company: Company not found");
  }

  // Fetch tender data with AI-generated summary and taxonomy
  const tenderRows = await db
    .select({
      title: tenders.title,
      description: tenders.description,
      aiSummary: tenders.aiSummary,
      aiCapabilityTaxonomy: tenders.aiCapabilityTaxonomy,
      buyer: tenders.buyer,
      budgetMin: tenders.budgetMin,
      budgetMax: tenders.budgetMax,
      deadline: tenders.deadline,
      location: tenders.location,
      cpvCodes: tenders.cpvCodes,
      requirements: tenders.requirements,
    })
    .from(tenders)
    .where(eq(tenders.id, tenderId))
    .limit(1);

  const tenderData = tenderRows[0];
  if (!tenderData) {
    throw new Error("Failed to fetch tender: Tender not found");
  }

  // Format budget range
  const budgetRange =
    tenderData.budgetMin || tenderData.budgetMax
      ? `£${tenderData.budgetMin ? tenderData.budgetMin.toLocaleString() : "?"} - £${tenderData.budgetMax ? tenderData.budgetMax.toLocaleString() : "?"}`
      : "Not specified";

  // Check data completeness for company
  const hasCapabilities =
    !!(
      companyData.keyCapabilities &&
      companyData.keyCapabilities.trim().length > 10
    ) ||
    !!(
      companyData.aiCapabilityTaxonomy &&
      (companyData.aiCapabilityTaxonomy as string[]).length > 0
    );
  const hasExperience = !!(
    companyData.pastProjects && companyData.pastProjects.trim().length > 20
  );
  const hasCertifications = !!(
    companyData.certifications && companyData.certifications.trim().length > 5
  );
  const hasLocation = !!companyData.postcode;
  const hasDescription = !!(
    companyData.description && companyData.description.trim().length > 20
  );

  const dataPoints = [
    hasCapabilities,
    hasExperience,
    hasCertifications,
    hasLocation,
    hasDescription,
  ].filter(Boolean).length;
  const _isMinimalData = dataPoints < 3;
  void _isMinimalData;

  const systemPrompt = `You are an expert at evaluating company-tender matches.

FIRST: Check if company and tender industries/sectors match (e.g., construction, healthcare, IT, telecom). If industries DON'T MATCH, set capabilityScore = 0 immediately. If industries match, rate capability relevance 0-100. Then rate Certification, Experience, Location 0-100 independently. No assumptions.

For matchReasons: Provide 2-4 SHORT, CLEAR bullet points explaining why this is a good match. Each reason should be:
- 10-15 words maximum
- Written in plain English
- Focus on specific capabilities, experience, or qualifications
- Example: "Company has 5+ years experience in similar healthcare projects"
- Example: "Strong capability match in construction and project management"

For improvementSuggestions: Provide 2-3 SHORT, ACTIONABLE suggestions for improvement. Each suggestion should be:
- 10-15 words maximum
- Specific and actionable
- Example: "Add ISO 9001 certification to improve competitiveness"
- Example: "Highlight more healthcare project case studies"

FIRST: Check if industries match. If NO → capabilityScore = 0. If YES → rate capability 0-100. Then rate certification, experience, location 0-100.`;

  const userPrompt = `Company: ${companyData.companyName || "N/A"}
${hasDescription ? `Description: ${companyData.description}` : "Description: NOT PROVIDED"}
${hasCapabilities ? (companyData.keyCapabilities ? `Capabilities: ${companyData.keyCapabilities}` : "") : "Capabilities: NOT PROVIDED"}
${hasCertifications ? `Certifications: ${companyData.certifications}` : "Certifications: NOT PROVIDED"}
${hasExperience ? `Past Projects: ${companyData.pastProjects}` : "Past Projects: NOT PROVIDED"}
${hasLocation ? `Location: ${companyData.postcode}` : "Location: NOT PROVIDED"}

Tender: ${tenderData.title || "N/A"}
Description: ${tenderData.description || "N/A"}
Buyer: ${tenderData.buyer || "N/A"}
Budget: ${budgetRange}
Location: ${tenderData.location || "N/A"}
${tenderData.cpvCodes && tenderData.cpvCodes.length > 0 ? `CPV Codes: ${tenderData.cpvCodes.join(", ")}` : ""}

FIRST: Check if industries match. If NO → capabilityScore = 0. If YES → rate capability 0-100. Then rate certification, experience, location 0-100.`;

  // Log the prompt for debugging
  console.log("\n" + "=".repeat(80));
  console.log(`Matching: ${companyData.companyName} → ${tenderData.title}`);

  // Call LLM with rate limiting via aiGenerateObject (rate limiter is built in)
  let score: MatchingScore;

  try {
    const parsed = await aiGenerateObject({
      schema: matchingScoreSchema,
      system: systemPrompt,
      prompt: userPrompt,
      modelId: model,
      maxTokens: 8000,
      estTokens: 4000,
    });

    console.log(`Got AI response for matching`);

    // Get scores from AI (no overallScore from AI - we calculate it)
    let capabilityScore = Math.max(
      0,
      Math.min(100, parsed.capabilityScore || 0),
    );
    let experienceScore = Math.max(
      0,
      Math.min(100, parsed.experienceScore || 0),
    );
    let certificationScore = Math.max(
      0,
      Math.min(100, parsed.certificationScore || 0),
    );
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
        certificationScore * 0.5 + experienceScore * 0.4 + locationScore * 0.1,
      );
    }

    const scoreExplanations = parsed.scoreExplanations || {
      capability: "",
      experience: "",
      location: "",
      certification: "",
    };

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

    score = {
      overallScore,
      capabilityScore,
      experienceScore,
      locationScore,
      certificationScore,
      matchReasons: parsed.matchReasons,
      improvementSuggestions: parsed.improvementSuggestions,
      aiAnalysis: parsed.aiAnalysis,
      scoreExplanations: finalScoreExplanations,
    };
  } catch (e) {
    console.error("Failed to get AI response for matching:", e);
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
        fallbackCertification * 0.5 +
          fallbackExperience * 0.4 +
          fallbackLocation * 0.1,
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
      aiAnalysis: "AI analysis failed",
      scoreExplanations: {
        capability: "Analysis unavailable",
        experience: "Analysis unavailable",
        location: "Analysis unavailable",
        certification: "Analysis unavailable",
      },
    };
  }

  const aiAnalysisPayload = {
    analysis: score.aiAnalysis,
    generated_at: new Date().toISOString(),
    score_explanations: score.scoreExplanations || {
      capability: `Capability score: ${score.capabilityScore}%`,
      experience: `Experience score: ${score.experienceScore}%`,
      location: `Location score: ${score.locationScore}%`,
      certification: `Certification score: ${score.certificationScore}%`,
    },
  };

  const modelUsed = model ?? "platform-default";

  if (isDemo) {
    // demo_matching_results is not in the Drizzle schema; use raw SQL
    await db.execute(
      sql`INSERT INTO demo_matching_results (batch_label, company_id, tender_id, model_used, overall_score, capability_score, experience_score, location_score, certification_score, match_reasons, improvement_suggestions, ai_analysis)
          VALUES (${batchLabel}, ${companyId}::uuid, ${tenderId}::uuid, ${modelUsed}, ${score.overallScore}, ${score.capabilityScore}, ${score.experienceScore}, ${score.locationScore}, ${score.certificationScore}, ${score.matchReasons}::text[], ${score.improvementSuggestions}::text[], ${JSON.stringify(aiAnalysisPayload)}::jsonb)`,
    );
  } else {
    await db
      .insert(matchingResults)
      .values({
        companyId,
        tenderId,
        overallScore: score.overallScore,
        capabilityScore: score.capabilityScore,
        experienceScore: score.experienceScore,
        locationScore: score.locationScore,
        certificationScore: score.certificationScore,
        matchReasons: score.matchReasons,
        improvementSuggestions: score.improvementSuggestions,
        aiAnalysis: aiAnalysisPayload,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [matchingResults.companyId, matchingResults.tenderId],
        set: {
          overallScore: score.overallScore,
          capabilityScore: score.capabilityScore,
          experienceScore: score.experienceScore,
          locationScore: score.locationScore,
          certificationScore: score.certificationScore,
          matchReasons: score.matchReasons,
          improvementSuggestions: score.improvementSuggestions,
          aiAnalysis: aiAnalysisPayload,
          updatedAt: new Date(),
        },
      });
  }

  console.log(
    `Match complete: ${companyData.companyName} → ${tenderData.title} (Score: ${score.overallScore}%)`,
  );
  return score;
}

/**
 * Batch score tenders for a company
 * This queues matching jobs rather than processing immediately
 */
export async function batchScoreTendersForCompany(
  companyId: string,
  tenderIds?: string[],
): Promise<{ jobCount: number; batchId: string }> {
  // If no tender IDs provided, fetch all open tenders
  let tendersToMatch: string[] = [];

  if (tenderIds && tenderIds.length > 0) {
    tendersToMatch = tenderIds;
  } else {
    const openTenders = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(inArray(tenders.status, ["open", "closing_soon"]));

    tendersToMatch = openTenders.map((t) => t.id);
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

  const { batchId } = await enqueueBatch(
    jobs,
    "company_matching",
    undefined,
    companyId,
  );

  return { jobCount: jobs.length, batchId };
}
