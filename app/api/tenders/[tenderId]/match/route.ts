import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { requireCompanyAccess } from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { curatedMatches, matchingResults } from "@/lib/db/schema/app";
import {
  activeCurationCondition,
  applyCuration,
  applyCurationToAnalysis,
} from "@/lib/services/curatedMatches";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenderId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const { tenderId } = await params;
    const url = new URL(request.url);
    const companyId = url.searchParams.get("companyId");

    if (!companyId) {
      return apiResponse({ error: "companyId is required" }, 400);
    }

    await requireCompanyAccess(user.id, companyId);

    // The detail page renders these numbers a second time, next to per-dimension
    // explanations. If it disagreed with the card the user just clicked, the
    // curation would be visible — so the same overlay is applied here.
    const result = await db
      .select({
        id: matchingResults.id,
        overallScore: matchingResults.overallScore,
        capabilityScore: matchingResults.capabilityScore,
        experienceScore: matchingResults.experienceScore,
        locationScore: matchingResults.locationScore,
        certificationScore: matchingResults.certificationScore,
        matchReasons: matchingResults.matchReasons,
        improvementSuggestions: matchingResults.improvementSuggestions,
        aiAnalysis: matchingResults.aiAnalysis,
        curation: {
          tenderId: curatedMatches.tenderId,
          curatedScore: curatedMatches.curatedScore,
          pinned: curatedMatches.pinned,
          pinRank: curatedMatches.pinRank,
          capabilityScore: curatedMatches.curatedCapabilityScore,
          experienceScore: curatedMatches.curatedExperienceScore,
          locationScore: curatedMatches.curatedLocationScore,
          certificationScore: curatedMatches.curatedCertificationScore,
          matchReasons: curatedMatches.curatedMatchReasons,
          summary: curatedMatches.curatedSummary,
        },
      })
      .from(matchingResults)
      .leftJoin(
        curatedMatches,
        and(
          eq(curatedMatches.companyId, matchingResults.companyId),
          eq(curatedMatches.tenderId, matchingResults.tenderId),
          activeCurationCondition(),
        ),
      )
      .where(
        and(
          eq(matchingResults.tenderId, tenderId),
          eq(matchingResults.companyId, companyId),
        ),
      )
      .limit(1);

    const row = result[0];
    if (!row) {
      return apiResponse({ match: null });
    }

    const { curation, ...match } = row;
    // A LEFT JOIN miss still produces the nested object, with every field null.
    const active = curation?.tenderId ? curation : undefined;
    const curated = applyCuration(
      {
        score: match.overallScore ?? 0,
        capabilityScore: match.capabilityScore,
        experienceScore: match.experienceScore,
        locationScore: match.locationScore,
        certificationScore: match.certificationScore,
        matchReasons: match.matchReasons,
      },
      active,
    );

    return apiResponse({
      match: {
        ...match,
        overallScore: curated.score,
        capabilityScore: curated.capabilityScore ?? null,
        experienceScore: curated.experienceScore ?? null,
        locationScore: curated.locationScore ?? null,
        certificationScore: curated.certificationScore ?? null,
        matchReasons: curated.matchReasons ?? null,
        aiAnalysis: applyCurationToAnalysis(match.aiAnalysis, active),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
