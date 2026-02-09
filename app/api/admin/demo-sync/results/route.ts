/* eslint-disable @typescript-eslint/no-explicit-any -- demo_matching_results not in generated Supabase types */
import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
  createAdminClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

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

    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from("demo_matching_results")
      .select(
        `
        id,
        created_at,
        batch_label,
        company_id,
        tender_id,
        model_used,
        overall_score,
        capability_score,
        experience_score,
        location_score,
        certification_score,
        match_reasons,
        improvement_suggestions,
        ai_analysis,
        tenders(title),
        companies(company_name)
      `,
      )
      .order("created_at", { ascending: true });

    if (error)
      return apiError(
        "Failed to fetch demo results: " + String(error.message),
        500,
      );

    const rows = (data ?? []).map((row: any) => {
      const tender = row.tenders ?? row.tender;
      const company = row.companies ?? row.company;
      return {
        ...row,
        tender_title: tender?.title ?? row.tender_id,
        company_name: company?.company_name ?? row.company_id,
      };
    });

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
