import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import {
  requireAuth,
  isCompanyMember,
  handleApiError,
  AuthError,
} from "@/lib/api/validation";
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

    const hasAccess = await isCompanyMember(user.id, companyId);
    if (!hasAccess) {
      throw new AuthError("No access to this company");
    }

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
