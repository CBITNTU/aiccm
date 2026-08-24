import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { aiGenerateObject } from "@/lib/ai";
import { performanceBenchmarkSchema } from "@/lib/schemas/performanceBenchmark";
import { logApiEvent } from "@/lib/services/eventLogger";
import {
  generateCompanyCapabilityTaxonomy,
  generateCompanySummary,
  generateCompanyMarketSuggestions,
} from "@/lib/services/companyAIService";
import type { DeepCompanyAnalysis, RelationSuggestion } from "@/lib/api/types";
import { z } from "zod";
import {
  requireAuth,
  validateBody,
  handleApiError,
} from "@/lib/api/validation";
import {
  requireCompanyAccess,
  markCompanyAdminPrepared,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import {
  companies,
  companyCapabilities,
  companyCapabilitiesRef,
  companyMarkets,
  markets,
} from "@/lib/db/schema/app";
import { companyColumnsNoEmbedding } from "@/lib/db/columns";
import { eq, inArray } from "drizzle-orm";
import { localizedName } from "@/lib/taxonomy/localizedName";
import {
  companyHasSparseData,
  enrichCompanyData,
  fetchCompanySources,
} from "@/lib/services/companyEnrichmentService";
import { NextResponse } from "next/server";
import { getPlatformAnalysisSettings } from "@/lib/platformAnalysisSettings";
import { getAnalysisRunsThisMonth, getEffectiveAnalysisLimit, getNextMonthStart } from "@/lib/analysisUsage";

const analyzeCompanyInputSchema = z.object({
  companyId: z.string().uuid(),
});

/** Placeholder for benchmark dimensions this route does not actually assess. */
const NOT_ASSESSED = "Not assessed yet";

/**
 * Resolve keyword-scored capability/market suggestions into named additions,
 * excluding anything the company already has. Removals are never proposed: AI
 * analysis must not suggest dropping a human selection.
 */
async function buildRelationSuggestions(
  companyId: string,
  suggestedCapabilityIds: string[],
  suggestedMarketIds: string[],
): Promise<{ capabilities: RelationSuggestion; markets: RelationSuggestion }> {
  const [currentCaps, currentMkts] = await Promise.all([
    db
      .select({ id: companyCapabilities.capabilityId })
      .from(companyCapabilities)
      .where(eq(companyCapabilities.companyId, companyId)),
    db
      .select({ id: companyMarkets.marketId })
      .from(companyMarkets)
      .where(eq(companyMarkets.companyId, companyId)),
  ]);

  const currentCapIds = currentCaps.map((c) => c.id);
  const currentMktIds = currentMkts.map((m) => m.id);

  const newCapIds = suggestedCapabilityIds.filter(
    (id) => !currentCapIds.includes(id),
  );
  const newMktIds = suggestedMarketIds.filter((id) => !currentMktIds.includes(id));

  const [capRows, mktRows] = await Promise.all([
    newCapIds.length
      ? db
          .select({
            id: companyCapabilitiesRef.id,
            name: localizedName(
              companyCapabilitiesRef.name,
              companyCapabilitiesRef.nameZh,
            ),
          })
          .from(companyCapabilitiesRef)
          .where(inArray(companyCapabilitiesRef.id, newCapIds))
      : Promise.resolve([]),
    newMktIds.length
      ? db
          .select({ id: markets.id, name: localizedName(markets.name, markets.nameZh) })
          .from(markets)
          .where(inArray(markets.id, newMktIds))
      : Promise.resolve([]),
  ]);

  return {
    capabilities: { currentIds: currentCapIds, additions: capRows },
    markets: { currentIds: currentMktIds, additions: mktRows },
  };
}

function buildPerformanceBenchmarkPrompt(
  company: {
    companyName: string;
    websiteUrl?: string | null;
    keyCapabilities?: string | null;
    equipment?: string | null;
    certifications?: string | null;
    pastProjects?: string | null;
    financialData?: Record<string, { value?: unknown }> | null;
  },
  scrapedContent?: {
    websiteHtml: string;
    companiesHouseHtml: string;
    endoleHtml: string;
  },
): string {
  const financialData = company.financialData || {};

  let prompt = `Score these 8 dimensions (0-100) with a short explanation. Also extract or infer company information (description, key_capabilities, certifications, past_projects, equipment, postcode, contact details) from any available data. Return JSON with performanceBenchmark and companyInfo.

For "description", write a detailed, informative company overview (roughly 120-200 words, 2-3 short paragraphs) that gives a clear picture of the company. Cover, using only evidence in the available data: (1) core activities and what the company does; (2) key capabilities and processes; (3) main products and services; (4) areas of expertise and specialisms; (5) sectors/markets and typical customers; and (6) key strengths or differentiators. Do NOT invent facts — omit anything not supported by the data rather than guessing. Write the description in the same language as the company's source information.

Company: ${company.companyName}
Website: ${company.websiteUrl || "N/A"}
Key Capabilities: ${company.keyCapabilities || "N/A"}
Equipment: ${company.equipment || "N/A"}
Certifications: ${company.certifications || "N/A"}
Past Projects: ${company.pastProjects || "N/A"}
Employees: ${financialData.employees?.value || "N/A"}
Net Assets: \u00A3${typeof financialData.netAssets?.value === "number" ? financialData.netAssets.value.toLocaleString() : "N/A"}
Total Assets: \u00A3${typeof financialData.totalAssets?.value === "number" ? financialData.totalAssets.value.toLocaleString() : "N/A"}
Cash: \u00A3${typeof financialData.cash?.value === "number" ? financialData.cash.value.toLocaleString() : "N/A"}`;

  if (scrapedContent) {
    if (scrapedContent.websiteHtml) {
      prompt += `\n\n--- Scraped Website Content ---\n${scrapedContent.websiteHtml}`;
    }
    if (scrapedContent.companiesHouseHtml) {
      prompt += `\n\n--- Companies House Data ---\n${scrapedContent.companiesHouseHtml}`;
    }
    if (scrapedContent.endoleHtml) {
      prompt += `\n\n--- Endole Financial Data ---\n${scrapedContent.endoleHtml.slice(0, 12000)}`;
    }
  }

  return prompt;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const { companyId } = await validateBody(
      request,
      analyzeCompanyInputSchema,
    );

    // Verify ownership or superadmin
    const companyRows = await db
      .select(companyColumnsNoEmbedding)
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    let company = companyRows[0];
    if (!company) {
      return apiResponse({ error: "Company not found" }, 404);
    }

    console.log("[CompanyAI:analyze] Input company data —", {
      companyName: company.companyName,
      hasWebsiteUrl: !!company.websiteUrl,
      hasKeyCapabilities: !!company.keyCapabilities,
      hasEquipment: !!company.equipment,
      hasCertifications: !!company.certifications,
      hasPastProjects: !!company.pastProjects,
      hasFinancialData: !!company.financialData,
    });

    // Superadmins can analyze any company on the owner's behalf. `adminOverride`
    // marks that case: the run is quota-free and sends no email.
    const access = await requireCompanyAccess(user.id, companyId);
    suppressEmailForAdminOverride(access, user.id);
    const { adminOverride } = access;

    // Check monthly analysis run limit (skipped for admin-initiated runs)
    const [analysisSettings, analysisRunsThisMonth] = await Promise.all([
      getPlatformAnalysisSettings(),
      getAnalysisRunsThisMonth(companyId, company.usageResetAt),
    ]);
    const analysisLimit = getEffectiveAnalysisLimit(company, analysisSettings);
    if (!adminOverride && analysisRunsThisMonth >= analysisLimit) {
      const resetsAt = getNextMonthStart().toISOString();
      return NextResponse.json(
        {
          error: `Analysis limit reached (${analysisRunsThisMonth}/${analysisLimit} this month). Resets on ${new Date(resetsAt).toLocaleDateString()}.`,
          limitExceeded: true,
          used: analysisRunsThisMonth,
          limit: analysisLimit,
          resetsAt,
        },
        { status: 429 },
      );
    }

    // Prefill fallback: if company has no enriched data, run prefill first
    if (
      companyHasSparseData(company) &&
      (company.companiesHouseNumber || company.websiteUrl)
    ) {
      console.log("[CompanyAI:analyze] No prefilled data found, running enrichment fallback...");
      try {
        const enriched = await enrichCompanyData(companyId);
        if (enriched) {
          // Re-read company to get enriched fields for the benchmark prompt
          const refreshed = await db
            .select(companyColumnsNoEmbedding)
            .from(companies)
            .where(eq(companies.id, companyId))
            .limit(1);
          if (refreshed[0]) {
            company = refreshed[0];
            console.log("[CompanyAI:analyze] Enrichment fallback succeeded, using enriched data");
          }
        }
      } catch (enrichError) {
        console.error("[CompanyAI:analyze] Enrichment fallback failed, continuing with existing data:", enrichError);
      }
    }

    // Crawl the company website (and, where applicable, public registries) on
    // EVERY analysis so we pull fresh capabilities, services and past projects.
    // Region-agnostic: registries need a Companies House number (UK only), while
    // the website crawl runs for any region that has a website URL.
    let scrapedContent: {
      websiteHtml: string;
      companiesHouseHtml: string;
      endoleHtml: string;
    } | undefined;
    // Set when a website URL exists but could not be read at all — surfaced to the
    // user as a warning (analysis still proceeds on existing data).
    let websiteFetchError: string | null = null;

    // Opportunistic: an analysis is the one moment we know the user cares about
    // this profile being complete. Only for companies still missing a logo, and
    // queued rather than inline so it cannot slow the analysis down.
    if (!company.logoUrl && company.websiteUrl) {
      try {
        const { enqueueJob } = await import("@/lib/services/queueService");
        await enqueueJob({
          jobType: "company_logo",
          entityType: "company",
          entityId: companyId,
          priority: 3,
        });
      } catch (queueError) {
        console.error("Failed to queue company logo job:", queueError);
      }
    }

    if (company.companiesHouseNumber || company.websiteUrl) {
      console.log("[CompanyAI:analyze] Crawling external sources for analysis...");
      try {
        const sources = await fetchCompanySources(
          company.companyName,
          company.companiesHouseNumber,
          company.websiteUrl,
        );
        if (sources.websiteHtml || sources.companiesHouseHtml || sources.endoleHtml) {
          scrapedContent = sources;
          console.log("[CompanyAI:analyze] Scraped content available —", {
            websiteChars: sources.websiteHtml.length,
            websitePages: sources.websitePagesFetched,
            companiesHouseChars: sources.companiesHouseHtml.length,
            endoleChars: sources.endoleHtml.length,
          });
        } else {
          console.log("[CompanyAI:analyze] No external data fetched. Errors:", sources.errors);
        }
        // If a website was configured but nothing came back, flag it for the user.
        if (company.websiteUrl && sources.websitePagesFetched === 0) {
          const websiteErr = sources.errors.find((e) => /website|page/i.test(e));
          websiteFetchError =
            websiteErr || "Could not read the company website.";
          console.warn("[CompanyAI:analyze] Website crawl failed:", websiteFetchError);
        }
      } catch (fetchError) {
        console.error("[CompanyAI:analyze] Source fetching failed:", fetchError);
        if (company.websiteUrl) {
          websiteFetchError =
            fetchError instanceof Error
              ? fetchError.message
              : "Could not read the company website.";
        }
      }
    }

    const prompt = buildPerformanceBenchmarkPrompt({
      companyName: company.companyName,
      websiteUrl: company.websiteUrl,
      keyCapabilities: company.keyCapabilities,
      equipment: company.equipment,
      certifications: company.certifications,
      pastProjects: company.pastProjects,
      financialData: company.financialData as Record<string, { value?: unknown }> | null,
    }, scrapedContent);

    console.log("[CompanyAI:analyze] Prompt —", prompt);

    const rawAnalysis = await aiGenerateObject({
      schema: performanceBenchmarkSchema,
      system: `Rate company 0-100 on each dimension. Analyze ALL available data including any scraped web content, Companies House data, and Endole financial data provided. Extract company information from any source available. Score 0 only if genuinely no relevant data exists across all sources.`,
      prompt,
      maxTokens: 10000,
    });

    console.log("[CompanyAI:analyze] AI response — benchmark scores:", JSON.stringify(rawAnalysis.performanceBenchmark, null, 2));
    console.log("[CompanyAI:analyze] AI response — companyInfo:", JSON.stringify(rawAnalysis.companyInfo, null, 2));

    const benchmark = rawAnalysis.performanceBenchmark;
    const analysis: DeepCompanyAnalysis = {
      companyInfo: rawAnalysis.companyInfo,
      performanceBenchmark: {
        technicalExpertise: benchmark.technicalExpertise.score,
        safetyStandards: benchmark.safetyStandards.score,
        innovation: benchmark.innovation.score,
        projectExperience: benchmark.projectExperience.score,
        certifications: benchmark.certifications.score,
        marketReputation: benchmark.marketReputation.score,
        financialHealth: benchmark.financialHealth.score,
        operationalCapacity: benchmark.operationalCapacity.score,
        overallScore: benchmark.overallScore.score,
      },
      coreCompetencies: [],
      digitalMaturity: NOT_ASSESSED,
      safetyRating: NOT_ASSESSED,
      marketPosition: NOT_ASSESSED,
      businessInsights: [],
      competitivePositioning: "Developing",
      swotSummary: {
        strengths: [],
        weaknesses: [],
        opportunities: [],
        threats: [],
      },
      executiveSummary: "Analysis completed.",
    };

    // Save analysis results AND fill company information fields
    const updateData: Partial<typeof companies.$inferInsert> = {
      aiAnalysis: analysis,
      updatedAt: new Date(),
    };

    console.log("[CompanyAI:analyze] Update payload (before field merging) — aiAnalysis set, updatedAt set");

    const companyInfo = analysis.companyInfo || {};

    // Reviewable text fields (description, keyCapabilities, certifications,
    // equipment, pastProjects) are NOT written here. They are surfaced to the
    // user as proposed changes in the AI-review modal, which applies accepted
    // fields via the normal company update path (respecting verification rules).
    // Only non-reviewable contact/postcode fields are auto-filled when empty.
    if (companyInfo.contact_person && !company.contactPerson) {
      updateData.contactPerson = companyInfo.contact_person as string;
    }
    if (companyInfo.contact_email && !company.contactEmail) {
      updateData.contactEmail = companyInfo.contact_email as string;
    }
    if (companyInfo.contact_phone && !company.contactPhone) {
      updateData.contactPhone = companyInfo.contact_phone as string;
    }
    if (companyInfo.postcode && !company.postcode) {
      updateData.postcode = companyInfo.postcode as string;
    }

    // These three are seeded with the NOT_ASSESSED placeholder above, which is
    // truthy — writing it through would clobber any real stored value on every
    // run. Only persist genuinely assessed values.
    if (analysis.digitalMaturity && analysis.digitalMaturity !== NOT_ASSESSED) {
      updateData.digitalMaturity = analysis.digitalMaturity;
    }
    if (analysis.safetyRating && analysis.safetyRating !== NOT_ASSESSED) {
      updateData.safetyRating = analysis.safetyRating;
    }
    if (analysis.marketPosition && analysis.marketPosition !== NOT_ASSESSED) {
      updateData.marketPosition = analysis.marketPosition;
    }

    // Mark as enriched so subsequent runs skip re-scraping
    if (scrapedContent) {
      updateData.systemExtracted = {
        ...((company.systemExtracted as Record<string, unknown>) || {}),
        enrichedAt: new Date().toISOString(),
        enrichmentResult: "inline_benchmark",
      };
    }

    console.log("[CompanyAI:analyze] Final update payload fields —", Object.keys(updateData));
    console.log("[CompanyAI:analyze] Final update payload values —", JSON.stringify(updateData, null, 2));

    try {
      await db
        .update(companies)
        .set(updateData)
        .where(eq(companies.id, companyId));
      console.log("[CompanyAI:analyze] DB update succeeded for company", companyId);
    } catch (updateError) {
      console.error("[CompanyAI:analyze] DB update FAILED:", updateError);
    }

    // The reviewable text columns are intentionally still unwritten at this point
    // (they are awaiting user acceptance in the review modal), so the keyword
    // scorers below would otherwise match against a nearly empty company record.
    // Feed them the AI's proposed text, falling back to the stored value.
    const textOverride = {
      description: (companyInfo.description as string) || company.description,
      keyCapabilities:
        (companyInfo.key_capabilities as string) || company.keyCapabilities,
      certifications:
        (companyInfo.certifications as string) || company.certifications,
      equipment: (companyInfo.equipment as string) || company.equipment,
      pastProjects: (companyInfo.past_projects as string) || company.pastProjects,
    };

    // Generate capabilities from the static list. applyWhenEmpty: false — this is
    // the interactive path, so the ids are surfaced for review instead of being
    // written straight into the junction table.
    let suggestedCapabilityIds: string[] = [];
    try {
      console.log("[CompanyAI:analyze] Starting capability taxonomy generation...");
      suggestedCapabilityIds = await generateCompanyCapabilityTaxonomy(
        companyId,
        false,
        { textOverride, applyWhenEmpty: false },
      );
      console.log("[CompanyAI:analyze] Capability taxonomy result —", suggestedCapabilityIds);
    } catch (capabilityError) {
      console.error("[CompanyAI:analyze] Capability taxonomy FAILED:", capabilityError);
    }

    // Generate market suggestions (L1 parent markets only, keyword matching)
    let suggestedMarketIds: string[] = [];
    try {
      console.log("[CompanyAI:analyze] Starting market suggestions...");
      suggestedMarketIds = await generateCompanyMarketSuggestions(companyId, {
        textOverride,
        applyWhenEmpty: false,
      });
      console.log("[CompanyAI:analyze] Market suggestions —", suggestedMarketIds);
    } catch (marketError) {
      console.error("[CompanyAI:analyze] Market suggestions FAILED:", marketError);
    }

    // Resolve the suggestions against the company's current selections so the
    // review modal can render named badges without another round-trip.
    const relationSuggestions = await buildRelationSuggestions(
      companyId,
      suggestedCapabilityIds,
      suggestedMarketIds,
    );

    // Generate AI summary for matching and UI display
    try {
      console.log("[CompanyAI:analyze] Starting summary generation...");
      const summaryResult = await generateCompanySummary(companyId);
      console.log("[CompanyAI:analyze] Summary result — length:", summaryResult.length, "preview:", summaryResult.substring(0, 200));
    } catch (summaryError) {
      console.error("[CompanyAI:analyze] Summary generation FAILED:", summaryError);
    }

    // Refresh basic-match vector after AI fields are written
    const { refreshCompanyEmbedding } = await import(
      "@/lib/services/embeddingService"
    );
    await refreshCompanyEmbedding(companyId, { force: true });

    logApiEvent(request, {
      actionType: "company_updated",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: {
        analysisType: "comprehensive",
        companyName: company.companyName,
        // Excluded from the monthly quota by `getAnalysisRunsThisMonth`.
        ...(adminOverride ? { initiatedBy: "admin" } : {}),
      },
    }).catch(() => {});

    if (adminOverride) {
      await markCompanyAdminPrepared(companyId, user.id);
    }

    return apiResponse({
      success: true,
      analysis,
      suggestedMarketIds,
      relationSuggestions,
      websiteFetchError,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
