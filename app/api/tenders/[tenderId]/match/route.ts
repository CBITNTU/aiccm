import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { requireCompanyAccess } from "@/lib/api/companyAccess";
import { db } from "@/lib/db";
import { matchingResults } from "@/lib/db/schema/app";
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
      })
      .from(matchingResults)
      .where(
        and(
          eq(matchingResults.tenderId, tenderId),
          eq(matchingResults.companyId, companyId),
        ),
      )
      .limit(1);

    return apiResponse({ match: result[0] ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}
