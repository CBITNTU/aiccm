import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, apiResponse, apiError } from "@/lib/api";
import { isCompanyMember } from "@/lib/api/validation";
import { aiGenerateObject } from "@/lib/ai";
import { matchingScoreSchema } from "@/lib/schemas/tenderMatching";
import { logApiEvent } from "@/lib/services/eventLogger";
import { enqueueBatch } from "@/lib/services/queueService";
import { getPlatformMatchingSettings } from "@/lib/platformMatchingSettings";
import { getMatchingRunsThisMonth, getEffectiveMatchingLimit, getNextMonthStart } from "@/lib/matchingUsage";
import { getActiveProfile } from "@/lib/deployment";
import { resolveCurrencyConfig } from "@/lib/format/currency";
import type { TenderMatchResult } from "@/lib/api/types";
import { db } from "@/lib/db";
import { companies, companyMembers, companyCapabilities, companyCapabilitiesRef, tenders, batchJobs } from "@/lib/db/schema/app";
import { eq, and, inArray, gte, desc } from "drizzle-orm";

type CompanyData = Pick<
  typeof companies.$inferSelect,
  | "id"
  | "companyName"
  | "description"
  | "keyCapabilities"
  | "postcode"
  | "pastProjects"
  | "certifications"
  | "equipment"
  | "safetyRating"
  | "digitalMaturity"
> & { location?: string | null };

// Only the company fields this route reads (CompanyData + the limit check) — avoids
// pulling the embedding vector and large AI JSONB out of Postgres on every match run.
const companyMatchColumns = {
  id: companies.id,
  companyName: companies.companyName,
  description: companies.description,
  keyCapabilities: companies.keyCapabilities,
  postcode: companies.postcode,
  pastProjects: companies.pastProjects,
  certifications: companies.certifications,
  equipment: companies.equipment,
  safetyRating: companies.safetyRating,
  digitalMaturity: companies.digitalMaturity,
  matchingRunsLimit: companies.matchingRunsLimit,
  verificationStatus: companies.verificationStatus,
};

type CompanyMatchRow = Pick<
  typeof companies.$inferSelect,
  | "id"
  | "companyName"
  | "description"
  | "keyCapabilities"
  | "postcode"
  | "pastProjects"
  | "certifications"
  | "equipment"
  | "safetyRating"
  | "digitalMaturity"
  | "matchingRunsLimit"
  | "verificationStatus"
>;

type TenderData = {
  id: string;
  title: string;
  description: string | null;
  buyer: string;
  location: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency?: string | null;
  deadline: string | null;
  cpvCodes: string[] | null;
  requirements: unknown;
  contactInfo: unknown;
};

/**
 * AI-based scoring similar to grant-matching's approach
 * @internal reserved for future batch scoring
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function analyzeTenderMatch(
  company: CompanyData,
  tender: TenderData,
): Promise<TenderMatchResult> {
  const hasCapabilities = !!(company.keyCapabilities && company.keyCapabilities.trim().length > 10);
  const hasExperience = !!(company.pastProjects && company.pastProjects.trim().length > 20);
  const hasCertifications = !!(company.certifications && company.certifications.trim().length > 5);
  const hasLocation = !!(company.postcode || company.location);

  const companyProfile = [
    `Company: ${company.companyName}`,
    company.description ? `Description: ${company.description}` : "",
    hasCapabilities ? `Capabilities: ${company.keyCapabilities}` : "Capabilities: NOT PROVIDED",
    hasExperience ? `Past Projects: ${company.pastProjects}` : "Past Projects: NOT PROVIDED",
    hasCertifications ? `Certifications: ${company.certifications}` : "Certifications: NOT PROVIDED",
    company.equipment ? `Equipment: ${company.equipment}` : "",
    hasLocation ? `Location: ${company.postcode || company.location}` : "Location: NOT PROVIDED",
  ].filter(Boolean).join("\n");

  const curSym = resolveCurrencyConfig(
    tender.currency,
    getActiveProfile().currency,
  ).symbol;
  const tenderInfo = [
    `Title: ${tender.title}`,
    tender.description ? `Description: ${tender.description}` : "",
    `Buyer: ${tender.buyer}`,
    tender.location ? `Location: ${tender.location}` : "",
    tender.budgetMin && tender.budgetMax
      ? `Budget: ${curSym}${tender.budgetMin.toLocaleString()} - ${curSym}${tender.budgetMax.toLocaleString()}`
      : tender.budgetMin ? `Budget: ${curSym}${tender.budgetMin.toLocaleString()}+`
      : tender.budgetMax ? `Budget: Up to ${curSym}${tender.budgetMax.toLocaleString()}` : "",
    tender.deadline ? `Deadline: ${new Date(tender.deadline).toLocaleDateString()}` : "",
    tender.cpvCodes && tender.cpvCodes.length > 0 ? `CPV Codes: ${tender.cpvCodes.join(", ")}` : "",
    tender.requirements ? `Requirements: ${JSON.stringify(tender.requirements)}` : "",
  ].filter(Boolean).join("\n");

  const systemPrompt = `You are an expert at evaluating company-tender matches. FIRST: Check if company and tender industries/sectors match (e.g., construction, healthcare, IT, telecom). If industries DON'T MATCH, set capabilityScore = 0 immediately. If industries match, rate capability relevance 0-100. Then rate Certification, Experience, Location 0-100 independently. No assumptions. Return JSON with capabilityScore, experienceScore, locationScore, certificationScore, matchReasons, improvementSuggestions, aiAnalysis, and scoreExplanations.`;

  const prompt = `Company: ${companyProfile}

Tender: ${tenderInfo}

FIRST: Check if industries match. If NO → capabilityScore = 0. If YES → rate capability 0-100. Then rate certification, experience, location 0-100. Return JSON with scores and explanations.`;

  console.log("\n" + "=".repeat(80));
  console.log("📋 TENDER MATCHING PROMPT BEING SENT TO AI:");
  console.log("=".repeat(80));
  console.log("\n🔹 SYSTEM PROMPT:");
  console.log(systemPrompt);
  console.log("\n🔹 ANALYSIS PROMPT:");
  console.log(prompt);
  console.log("\n" + "=".repeat(80) + "\n");

  try {
    const estTokens = Math.ceil((prompt.length + companyProfile.length + tenderInfo.length) / 4) + 400;

    const parsed = await aiGenerateObject({
      schema: matchingScoreSchema,
      system: systemPrompt,
      prompt,
      maxTokens: 8000,
      estTokens,
    });

    let capabilityScore = Math.max(0, Math.min(100, parsed.capabilityScore || 0));
    let experienceScore = Math.max(0, Math.min(100, parsed.experienceScore || 0));
    let locationScore = Math.max(0, Math.min(100, parsed.locationScore || 0));
    let certificationScore = Math.max(0, Math.min(100, parsed.certificationScore || 0));

    if (!hasCapabilities) capabilityScore = 0;
    if (!hasExperience) experienceScore = 0;
    if (!hasCertifications) certificationScore = 0;
    if (!hasLocation) locationScore = 0;

    let weightedTotal = 0;
    if (capabilityScore >= 50) {
      weightedTotal = Math.round(certificationScore * 0.5 + experienceScore * 0.4 + locationScore * 0.1);
    }

    const scoreExplanations = parsed.scoreExplanations || { capability: "", experience: "", location: "", certification: "" };
    const finalScoreExplanations = {
      capability: !hasCapabilities ? "No capabilities listed - score set to 0" : scoreExplanations.capability || `Capability score: ${capabilityScore}%`,
      experience: !hasExperience ? "No past projects listed - score set to 0" : scoreExplanations.experience || `Experience score: ${experienceScore}%`,
      location: !hasLocation ? "Location not provided - score set to 0. Do not assume location." : scoreExplanations.location || `Location score: ${locationScore}%`,
      certification: !hasCertifications ? "No certifications listed - score set to 0" : scoreExplanations.certification || `Certification score: ${certificationScore}%`,
    };

    return {
      overallScore: Math.max(0, Math.min(100, weightedTotal)),
      capabilityScore: Math.max(0, Math.min(100, capabilityScore)),
      experienceScore: Math.max(0, Math.min(100, experienceScore)),
      locationScore: Math.max(0, Math.min(100, locationScore)),
      certificationScore: Math.max(0, Math.min(100, certificationScore)),
      matchReasons: parsed.matchReasons.length > 0 ? parsed.matchReasons : ["Limited match - review details"],
      improvementSuggestions: parsed.improvementSuggestions.length > 0 ? parsed.improvementSuggestions : ["Profile alignment could be improved"],
      aiAnalysis: {
        summary: parsed.aiAnalysis || "Match analysis completed",
        strengths: parsed.matchReasons,
        weaknesses: parsed.improvementSuggestions,
        recommendations: parsed.improvementSuggestions.length > 0 ? parsed.improvementSuggestions : ["Continue building relevant capabilities"],
        scoreExplanations: finalScoreExplanations,
      },
    };
  } catch (error) {
    console.error("Error in AI matching:", error);
    const fallbackCapability = hasCapabilities ? 50 : 0;
    const fallbackExperience = hasExperience ? 50 : 0;
    const fallbackCertification = hasCertifications ? 50 : 0;
    const fallbackLocation = hasLocation ? 50 : 0;

    let fallbackOverall = 0;
    if (fallbackCapability >= 50) {
      fallbackOverall = Math.round(fallbackCertification * 0.5 + fallbackExperience * 0.4 + fallbackLocation * 0.1);
    }

    return {
      overallScore: fallbackOverall,
      capabilityScore: fallbackCapability,
      experienceScore: fallbackExperience,
      locationScore: fallbackLocation,
      certificationScore: fallbackCertification,
      matchReasons: ["AI analysis unavailable - manual review recommended"],
      improvementSuggestions: ["Unable to generate suggestions"],
      aiAnalysis: {
        summary: "AI analysis failed - please review manually",
        strengths: [],
        weaknesses: ["Analysis unavailable"],
        recommendations: ["Manual review required"],
        scoreExplanations: { capability: "Analysis unavailable", experience: "Analysis unavailable", location: "Analysis unavailable", certification: "Analysis unavailable" },
      },
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (!user) {
      console.error("Authentication failed:", authError);
      return apiError("Invalid or expired session. Please sign in again.", 401);
    }

    console.log("Starting tender matching for user:", user.id);

    const requestBody = await request.json().catch(() => ({}));
    const targetCompanyId = requestBody.companyId;
    const force = requestBody.force === true;

    let company: CompanyMatchRow | null = null;

    if (targetCompanyId) {
      const hasAccess = await isCompanyMember(user.id, targetCompanyId);
      if (!hasAccess) {
        return apiError(`Company not found or access denied: ${targetCompanyId}`, 404);
      }

      const result = await db
        .select(companyMatchColumns)
        .from(companies)
        .where(and(eq(companies.id, targetCompanyId), eq(companies.status, "active")))
        .limit(1);

      company = result[0] ?? null;
      if (!company) {
        return apiError(`Company not found or not active: ${targetCompanyId}`, 404);
      }
    } else {
      // Get user's own active company first
      const ownResult = await db
        .select(companyMatchColumns)
        .from(companies)
        .where(and(eq(companies.userId, user.id), eq(companies.status, "active")))
        .limit(1);

      if (ownResult.length > 0) {
        company = ownResult[0];
      } else {
        // Fall back to companies where user is an approved team member
        const membershipResult = await db
          .select({ companyId: companyMembers.companyId })
          .from(companyMembers)
          .where(and(eq(companyMembers.userId, user.id), eq(companyMembers.status, "approved")))
          .limit(1);

        if (membershipResult.length > 0) {
          const memberCompanyResult = await db
            .select(companyMatchColumns)
            .from(companies)
            .where(and(eq(companies.id, membershipResult[0].companyId), eq(companies.status, "active")))
            .limit(1);
          company = memberCompanyResult[0] ?? null;
        }
      }

      if (!company) {
        return apiError("No active company found for user", 404);
      }
    }

    const companyData: CompanyData = {
      id: company.id,
      companyName: company.companyName,
      description: company.description,
      keyCapabilities: company.keyCapabilities,
      postcode: company.postcode,
      pastProjects: company.pastProjects,
      certifications: company.certifications,
      equipment: company.equipment,
      safetyRating: company.safetyRating,
      digitalMaturity: company.digitalMaturity,
    };
    console.log("Found company:", companyData.companyName);

    // Fetch company capabilities from junction table
    const capResults = await db
      .select({ name: companyCapabilitiesRef.name })
      .from(companyCapabilities)
      .innerJoin(companyCapabilitiesRef, eq(companyCapabilities.capabilityId, companyCapabilitiesRef.id))
      .where(eq(companyCapabilities.companyId, companyData.id));

    const capabilityNames = capResults.map((c) => c.name).filter(Boolean).join(" ");

    if (capabilityNames) {
      companyData.keyCapabilities = (companyData.keyCapabilities || "") + " " + capabilityNames;
    }

    // Get open tenders with deadline >= today
    const today = new Date().toISOString().split("T")[0];

    const tenderResults = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(
        and(
          inArray(tenders.status, ["open", "closing_soon", "framework"]),
          gte(tenders.deadline, new Date(today)),
        ),
      );

    if (tenderResults.length === 0) {
      return apiResponse({
        message: "All tenders are up to date - no new tenders to analyze",
        analyzedCount: 0,
        upToDate: true,
      });
    }

    console.log(`Found ${tenderResults.length} tenders to analyze`);

    const {
      findTenderIdsWithCachedMatches,
      splitTendersForDeepMatch,
      resolveMatchingJobMetadata,
    } = await import("@/lib/services/tenderMatchingService");

    const allTenderIds = tenderResults.map((t) => t.id);
    const cachedIds = await findTenderIdsWithCachedMatches(
      companyData.id,
      allTenderIds,
    );
    const { toQueue, skipped } = splitTendersForDeepMatch(
      allTenderIds,
      cachedIds,
      force,
    );

    if (toQueue.length === 0) {
      return apiResponse({
        message: "All tenders already analyzed",
        analyzedCount: 0,
        upToDate: true,
        skippedCount: skipped.length,
      });
    }

    const { metadata: matchingMetadata, matchingModel } =
      await resolveMatchingJobMetadata();
    const metadata: Record<string, unknown> = {
      ...matchingMetadata,
      force,
    };

    const tenderIdSet = new Set(toQueue);
    const jobs = tenderResults
      .filter((tender) => tenderIdSet.has(tender.id))
      .map((tender) => ({
      jobType: "tender_matching" as const,
      entityType: "tender" as const,
      entityId: tender.id,
      companyId: companyData.id,
      tenderId: tender.id,
      priority: 5,
      metadata,
    }));

    // Check if there's already an active batch for this company
    const existingBatches = await db
      .select({
        id: batchJobs.id,
        status: batchJobs.status,
        createdAt: batchJobs.createdAt,
        totalJobs: batchJobs.totalJobs,
      })
      .from(batchJobs)
      .where(
        and(
          eq(batchJobs.companyId, companyData.id),
          eq(batchJobs.status, "processing"),
        ),
      )
      .orderBy(desc(batchJobs.createdAt))
      .limit(1);

    if (existingBatches.length > 0) {
      const existingBatch = existingBatches[0];
      const { getBatchStatus } = await import("@/lib/services/queueService");
      const batchStatus = await getBatchStatus(existingBatch.id);

      console.log(
        `⚠️ Company ${companyData.id} has active batch ${existingBatch.id}: ${batchStatus?.completedJobs || 0}/${existingBatch.totalJobs} completed`,
      );

      return apiResponse({
        message: "Matching already in progress",
        batchId: existingBatch.id,
        totalTenders: existingBatch.totalJobs,
        status: "already_running",
      });
    }

    // Check monthly matching run limit
    const [matchingSettings, runsThisMonth] = await Promise.all([
      getPlatformMatchingSettings(),
      getMatchingRunsThisMonth(companyData.id),
    ]);
    const effectiveLimit = getEffectiveMatchingLimit(company, matchingSettings);
    if (runsThisMonth >= effectiveLimit) {
      const resetsAt = getNextMonthStart().toISOString();
      return NextResponse.json(
        {
          error: `Matching run limit reached (${runsThisMonth}/${effectiveLimit} this month). Resets on ${new Date(resetsAt).toLocaleDateString()}.`,
          limitExceeded: true,
          used: runsThisMonth,
          limit: effectiveLimit,
          resetsAt,
        },
        { status: 429 },
      );
    }

    // Create batch and queue all jobs
    const { batchId, jobIds } = await enqueueBatch(jobs, "tender_matching", user.id, companyData.id);

    console.log(`✅ Created batch ${batchId}: ${jobs.length} jobs queued`);

    // Trigger queue worker
    const workerUrl = `${process.env.PLATFORM_URL || "http://localhost:3000"}/api/queue/worker`;
    console.log(`🚀 Triggering worker at ${workerUrl}`);

    const triggerWorker = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      try {
        const res = await fetch(workerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 10, maxDurationMs: 50000, selfTrigger: true, concurrency: 5 }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) console.log(`✅ Worker triggered successfully`);
        else console.error(`❌ Worker trigger failed: ${res.status} ${res.statusText}`);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") console.log(`⏱️ Worker trigger timed out - cron will recover`);
        else console.error("❌ Failed to trigger queue worker:", err);
      }
    };

    triggerWorker();

    await logApiEvent(request, {
      actionType: "matching_started",
      userId: user?.id || null,
      userEmail: user?.email || undefined,
      entityType: "company",
      entityId: companyData.id,
      details: { batchId, totalTenders: toQueue.length, skippedCount: skipped.length, companyName: companyData.companyName },
    }).catch(() => {});

    return apiResponse({
      message: "Tender matching started",
      batchId: batchId,
      totalTenders: toQueue.length,
      skippedCount: skipped.length,
      queuedJobs: jobIds.length,
      matchingModel,
      status: "processing",
    });
  } catch (error) {
    console.error("Error in match-tenders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("Error details:", { message, stack });
    return apiError(message, 500);
  }
}
