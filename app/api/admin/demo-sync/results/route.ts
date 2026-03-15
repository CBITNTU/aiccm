import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { eq, asc } from "drizzle-orm";
import { demoMatchingResults, tenders, companies } from "@/lib/db/schema";

/**
 * GET /api/admin/demo-sync/results
 * Returns all rows from demo_matching_results for the admin test mode UI.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) return apiError("Unauthorized", 401);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) return apiError("Forbidden: Superadmin access required", 403);

    const result = await db
      .select({
        id: demoMatchingResults.id,
        created_at: demoMatchingResults.createdAt,
        batch_label: demoMatchingResults.batchLabel,
        company_id: demoMatchingResults.companyId,
        tender_id: demoMatchingResults.tenderId,
        model_used: demoMatchingResults.modelUsed,
        overall_score: demoMatchingResults.overallScore,
        capability_score: demoMatchingResults.capabilityScore,
        experience_score: demoMatchingResults.experienceScore,
        location_score: demoMatchingResults.locationScore,
        certification_score: demoMatchingResults.certificationScore,
        match_reasons: demoMatchingResults.matchReasons,
        improvement_suggestions: demoMatchingResults.improvementSuggestions,
        ai_analysis: demoMatchingResults.aiAnalysis,
        tender_title: tenders.title,
        company_name: companies.companyName,
      })
      .from(demoMatchingResults)
      .leftJoin(tenders, eq(tenders.id, demoMatchingResults.tenderId))
      .leftJoin(companies, eq(companies.id, demoMatchingResults.companyId))
      .orderBy(asc(demoMatchingResults.createdAt));

    const rows = result.map((row) => ({
      ...row,
      tender_title: row.tender_title ?? row.tender_id,
      company_name: row.company_name ?? row.company_id,
    }));

    await logApiEvent(request, {
      actionType: "admin_demo_sync_results",
      userId: user.id,
      userEmail: user.email || undefined,
      details: { row_count: rows.length },
    }).catch(() => {});

    return apiResponse(rows);
  } catch (e) {
    console.error("Demo results error:", e);
    return apiError(
      e instanceof Error ? e.message : "Fetch results failed",
      500,
    );
  }
}
