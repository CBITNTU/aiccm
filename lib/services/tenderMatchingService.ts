 
import { aiGenerateObject, getMatchingModelFromEnv, isOllamaModelId } from "@/lib/ai";
import { matchingScoreSchema } from "@/lib/schemas/tenderMatching";
import { db } from "@/lib/db";
import { companies, tenders, matchingResults, demoMatchingResults, virtualOrganizations, voMembers, companyTaxonomies, taxonomies, companyStandards, standardsRef, companyCapabilities, companyCapabilitiesRef } from "@/lib/db/schema/app";
import { eq, inArray, or } from "drizzle-orm";

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
  /** Model ID. Known IDs live in MATCHING_MODEL_IDS but local Ollama tags are accepted too. */
  model?: string;
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
  const model: string | undefined = options?.model ?? getMatchingModelFromEnv();
  const isDemo = options?.demo === true;
  const batchLabel = options?.batchLabel ?? "User A";
  // Fetch company data with AI-generated summary and taxonomy
  const companyRows = await db
    .select({
      companyName: companies.companyName,
      description: companies.description,
      aiSummary: companies.aiSummary,
      aiCapabilityTaxonomy: companies.aiCapabilityTaxonomy,
      aiCapabilities: companies.aiCapabilities,
      aiCompetencies: companies.aiCompetencies,
      keyCapabilities: companies.keyCapabilities,
      certifications: companies.certifications,
      pastProjects: companies.pastProjects,
      postcode: companies.postcode,
      address: companies.address,
      operationLocations: companies.operationLocations,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const companyData = companyRows[0];
  if (!companyData) {
    throw new Error("Failed to fetch company: Company not found");
  }

  // Fetch company taxonomy categories (manually selected from the overview page)
  const companyTaxonomyRows = await db
    .select({ name: taxonomies.name })
    .from(companyTaxonomies)
    .innerJoin(taxonomies, eq(companyTaxonomies.taxonomyId, taxonomies.id))
    .where(eq(companyTaxonomies.companyId, companyId));

  const taxonomyNames = companyTaxonomyRows.map((t) => t.name).filter(Boolean);

  // Fetch structured standards selected via Capabilities → Standards & Certifications
  const companyStandardRows = await db
    .select({ name: standardsRef.name })
    .from(companyStandards)
    .innerJoin(standardsRef, eq(companyStandards.standardId, standardsRef.id))
    .where(eq(companyStandards.companyId, companyId));

  const structuredStandardNames = companyStandardRows.map((s) => s.name).filter(Boolean);

  // Fetch structured competencies selected via Capabilities → Competencies tab
  const companyCapabilityRows = await db
    .select({ name: companyCapabilitiesRef.name, category: companyCapabilitiesRef.category })
    .from(companyCapabilities)
    .innerJoin(companyCapabilitiesRef, eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id))
    .where(eq(companyCapabilities.companyId, companyId));

  const structuredCapabilityNames = companyCapabilityRows
    .map((c) => (c.category ? `${c.name} (${c.category})` : c.name))
    .filter(Boolean);

  // Fetch VO projects where the company is lead or member.
  // The join on voMembers can produce multiple rows per project (one per member), so we
  // select the VO id and deduplicate by it to avoid inflating the project list.
  const voProjectRows = await db
    .select({
      id: virtualOrganizations.id,
      name: virtualOrganizations.name,
      description: virtualOrganizations.description,
      status: virtualOrganizations.status,
      tenderTitle: tenders.title,
    })
    .from(virtualOrganizations)
    .leftJoin(tenders, eq(tenders.id, virtualOrganizations.targetTenderId))
    .leftJoin(voMembers, eq(voMembers.voId, virtualOrganizations.id))
    .where(
      or(
        eq(virtualOrganizations.leadCompanyId, companyId),
        eq(voMembers.companyId, companyId),
      ),
    );

  // Deduplicate by VO id (company could be both lead and a listed member)
  const uniqueVOProjects = Array.from(
    new Map(voProjectRows.map((p) => [p.id, p])).values(),
  );

  const formattedVOProjects = uniqueVOProjects
    .map((p) => {
      let line = `Project: ${p.name}`;
      if (p.description) line += ` - ${p.description.slice(0, 150)}`;
      if (p.tenderTitle) line += ` (Tender: ${p.tenderTitle})`;
      if (p.status) line += ` [${p.status}]`;
      return line;
    })
    .join("\n");

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
  // "Direct" means user-entered data; "indirect" means AI-generated or derived data
  const hasDirectCapabilities =
    !!(companyData.keyCapabilities && companyData.keyCapabilities.trim().length > 10) ||
    structuredCapabilityNames.length > 0;
  const hasIndirectCapabilities =
    !!(companyData.aiCapabilityTaxonomy && (companyData.aiCapabilityTaxonomy as unknown[]).length > 0) ||
    !!(companyData.aiCapabilities && Object.keys(companyData.aiCapabilities as object).length > 0);
  const hasCapabilities = hasDirectCapabilities || hasIndirectCapabilities;

  // Parse structured past projects from company record
  let parsedPastProjects: { name: string; description?: string; client?: string; value?: string; year?: string; sector?: string }[] = [];
  if (companyData.pastProjects && companyData.pastProjects.trim().length > 0) {
    try {
      const parsed = JSON.parse(companyData.pastProjects);
      if (Array.isArray(parsed)) {
        parsedPastProjects = parsed.filter((p: { name?: string }) => p.name?.trim());
      }
    } catch {
      // Legacy plain text — treat as unstructured experience
    }
  }

  const formattedPastProjects = parsedPastProjects
    .map((p) => {
      let line = `Past Project: ${p.name}`;
      if (p.description) line += ` - ${p.description.slice(0, 150)}`;
      if (p.client) line += ` (Client: ${p.client})`;
      if (p.value) line += ` [Value: ${p.value}]`;
      if (p.year) line += ` [${p.year}]`;
      if (p.sector) line += ` [Sector: ${p.sector}]`;
      return line;
    })
    .join("\n");

  const hasDirectExperience = uniqueVOProjects.length > 0 || parsedPastProjects.length > 0;
  const hasIndirectExperience = !!(
    companyData.aiSummary && String(companyData.aiSummary).trim().length > 20
  );
  const hasExperience = hasDirectExperience || hasIndirectExperience;

  const hasDirectCertifications =
    !!(companyData.certifications && companyData.certifications.trim().length > 5) ||
    structuredStandardNames.length > 0;
  const hasIndirectCertifications = !!(
    companyData.aiCompetencies && Object.keys(companyData.aiCompetencies as object).length > 0
  );
  const hasCertifications = hasDirectCertifications || hasIndirectCertifications;

  const hasDirectLocation = !!companyData.postcode;
  const hasIndirectLocation =
    !!companyData.address ||
    !!(companyData.operationLocations && (companyData.operationLocations as unknown[]).length > 0);
  const hasLocation = hasDirectLocation || hasIndirectLocation;

  const hasDirectDescription = !!(
    companyData.description && companyData.description.trim().length > 20
  );
  const hasIndirectDescription = !!(
    companyData.aiSummary && String(companyData.aiSummary).trim().length > 20
  );
  const hasDescription = hasDirectDescription || hasIndirectDescription;

  const _dataPoints = [
    hasCapabilities,
    hasExperience,
    hasCertifications,
    hasLocation,
    hasDescription,
  ].filter(Boolean).length;

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

  // Build company section with all available data (omit missing fields entirely)
  const companyLines: string[] = [
    `Company: ${companyData.companyName || "N/A"}`,
  ];

  if (companyData.description && companyData.description.trim().length > 0) {
    companyLines.push(`Description: ${companyData.description.trim().slice(0, 500)}`);
  }
  if (companyData.aiSummary && String(companyData.aiSummary).trim().length > 0) {
    companyLines.push(`AI Summary: ${String(companyData.aiSummary).trim().slice(0, 500)}`);
  }
  if (companyData.keyCapabilities && companyData.keyCapabilities.trim().length > 0) {
    companyLines.push(`Capabilities: ${companyData.keyCapabilities.trim()}`);
  }
  if (companyData.aiCapabilityTaxonomy && (companyData.aiCapabilityTaxonomy as unknown[]).length > 0) {
    companyLines.push(`AI Capability Taxonomy: ${JSON.stringify(companyData.aiCapabilityTaxonomy)}`);
  }
  if (companyData.aiCompetencies && Object.keys(companyData.aiCompetencies as object).length > 0) {
    companyLines.push(`AI Competencies: ${JSON.stringify(companyData.aiCompetencies)}`);
  }
  if (structuredCapabilityNames.length > 0) {
    companyLines.push(`Competencies: ${structuredCapabilityNames.join(", ")}`);
  }
  if (structuredStandardNames.length > 0) {
    companyLines.push(`Standards & Certifications: ${structuredStandardNames.join(", ")}`);
  } else if (companyData.certifications && companyData.certifications.trim().length > 0) {
    companyLines.push(`Certifications: ${companyData.certifications.trim()}`);
  }
  if (taxonomyNames.length > 0) {
    companyLines.push(`Industry Categories: ${taxonomyNames.join(", ")}`);
  }
  const allProjects = [formattedPastProjects, formattedVOProjects].filter(Boolean).join("\n");
  if (allProjects.length > 0) {
    companyLines.push(`Projects:\n${allProjects}`);
  }
  if (companyData.postcode) {
    companyLines.push(`Location: ${companyData.postcode}`);
  } else if (companyData.address) {
    companyLines.push(`Location: ${companyData.address}`);
  }
  if (companyData.operationLocations && (companyData.operationLocations as unknown[]).length > 0) {
    companyLines.push(`Operation Locations: ${JSON.stringify(companyData.operationLocations)}`);
  }

  const userPrompt = `${companyLines.join("\n")}

Tender: ${tenderData.title || "N/A"}
Description: ${tenderData.description || "N/A"}
Buyer: ${tenderData.buyer || "N/A"}
Budget: ${budgetRange}
Location: ${tenderData.location || "N/A"}
${tenderData.cpvCodes && tenderData.cpvCodes.length > 0 ? `CPV Codes: ${tenderData.cpvCodes.join(", ")}` : ""}

FIRST: Check if industries match. If NO → capabilityScore = 0. If YES → rate capability 0-100. Then rate certification, experience, location 0-100.`;

  // Call LLM with rate limiting via aiGenerateObject (rate limiter is built in)
  let score: MatchingScore;

  try {
    const useOllama = model != null && isOllamaModelId(model);
    const parsed = await aiGenerateObject({
      schema: matchingScoreSchema,
      system: systemPrompt,
      prompt: userPrompt,
      modelId: model,
      maxTokens: useOllama ? 4096 : 8000,
      estTokens: useOllama ? 2000 : 4000,
      temperature: useOllama ? 0.2 : undefined,
    });

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

    // Enforce rules based on data completeness
    // Hard zero if no data at all; 0.7 penalty if only AI/indirect data available
    if (!hasCapabilities) {
      capabilityScore = 0;
    } else if (!hasDirectCapabilities) {
      capabilityScore = Math.round(capabilityScore * 0.7);
    }

    if (!hasExperience) {
      experienceScore = 0;
    } else if (!hasDirectExperience) {
      experienceScore = Math.round(experienceScore * 0.7);
    }

    if (!hasCertifications) {
      certificationScore = 0;
    } else if (!hasDirectCertifications) {
      certificationScore = Math.round(certificationScore * 0.7);
    }

    if (!hasLocation) {
      locationScore = 0;
    } else if (!hasDirectLocation) {
      locationScore = Math.round(locationScore * 0.7);
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

    // Override explanations when we force scores to 0 or apply penalties
    const finalScoreExplanations = {
      capability: !hasCapabilities
        ? "No capabilities listed - score set to 0"
        : !hasDirectCapabilities
          ? `Based on AI-extracted capabilities only (30% penalty applied). Score: ${capabilityScore}%`
          : scoreExplanations.capability || `Capability score: ${capabilityScore}%`,
      experience: !hasExperience
        ? "No project history or AI summary found - score set to 0"
        : !hasDirectExperience
          ? `Based on AI summary only, no past projects or VO projects (30% penalty applied). Score: ${experienceScore}%`
          : scoreExplanations.experience || `Experience score: ${experienceScore}%`,
      location: !hasLocation
        ? "Location not provided - score set to 0"
        : !hasDirectLocation
          ? `Based on address/operation locations only (30% penalty applied). Score: ${locationScore}%`
          : scoreExplanations.location || `Location score: ${locationScore}%`,
      certification: !hasCertifications
        ? "No certifications listed - score set to 0"
        : !hasDirectCertifications
          ? `Based on AI competencies only (30% penalty applied). Score: ${certificationScore}%`
          : scoreExplanations.certification || `Certification score: ${certificationScore}%`,
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
    await db.insert(demoMatchingResults).values({
      batchLabel: batchLabel!,
      companyId,
      tenderId,
      modelUsed,
      overallScore: score.overallScore,
      capabilityScore: score.capabilityScore,
      experienceScore: score.experienceScore,
      locationScore: score.locationScore,
      certificationScore: score.certificationScore,
      matchReasons: score.matchReasons,
      improvementSuggestions: score.improvementSuggestions,
      aiAnalysis: aiAnalysisPayload,
    });
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
