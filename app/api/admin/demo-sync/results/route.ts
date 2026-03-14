import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

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

    // demo_matching_results is not in the Drizzle schema, so use raw SQL
    const result = await db.execute(sql`
      SELECT
        dmr.id,
        dmr.created_at,
        dmr.batch_label,
        dmr.company_id,
        dmr.tender_id,
        dmr.model_used,
        dmr.overall_score,
        dmr.capability_score,
        dmr.experience_score,
        dmr.location_score,
        dmr.certification_score,
        dmr.match_reasons,
        dmr.improvement_suggestions,
        dmr.ai_analysis,
        t.title AS tender_title,
        c.company_name
      FROM demo_matching_results dmr
      LEFT JOIN tenders t ON t.id = dmr.tender_id
      LEFT JOIN companies c ON c.id = dmr.company_id
      ORDER BY dmr.created_at ASC
    `);

    const rows = (result.rows ?? []).map((row: Record<string, unknown>) => ({
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
