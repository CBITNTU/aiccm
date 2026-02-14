/* eslint-disable @typescript-eslint/no-explicit-any -- rpc truncate_demo_matching_results */
import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
  createAdminClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import {
  clearPendingDemoJobs,
  enqueueBatch,
} from "@/lib/services/queueService";
import { getPlatformAISettings } from "@/lib/platformSettings";
import type { MatchingModelId } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

const DEFAULT_TENDER_COUNT = 50;

/**
 * POST /api/admin/demo-sync/run
 * Body: { model, tenderCount?, reasoningEffort? }
 * reasoningEffort: for GPT-5 nano only - "none" | "minimal" | "low" | "medium" | "high" | "xhigh" (lower = faster).
 * Truncates demo_matching_results, enqueues demo matching jobs for "User A", triggers worker.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) return apiError("Unauthorized", 401);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) return apiError("Forbidden: Superadmin access required", 403);

    const body = await request.json().catch(() => ({}));
    const platformDefault = (await getPlatformAISettings()).default_ai_model;
    const model = (body.model ?? platformDefault) as MatchingModelId;
    const tenderCount = Math.min(
      100,
      Math.max(1, Number(body.tenderCount) || DEFAULT_TENDER_COUNT),
    );

    const validEfforts = [
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
    ] as const;
    const reasoningEffort =
      typeof body.reasoningEffort === "string" &&
      validEfforts.includes(
        body.reasoningEffort as (typeof validEfforts)[number],
      )
        ? (body.reasoningEffort as (typeof validEfforts)[number])
        : undefined;

    const supabase = createAdminClient();

    // Empty queue of pending demo jobs so only this run's jobs are processed (no mixing OpenAI/Gemini)
    await clearPendingDemoJobs().catch((err) =>
      console.error("Clear pending demo jobs failed:", err),
    );

    const { error: truncateError } = await (supabase as any).rpc(
      "truncate_demo_matching_results",
    );
    if (truncateError) {
      return apiError(
        "Failed to truncate demo table. Run migrations (e.g. supabase db push). " +
          String(truncateError),
        500,
      );
    }

    const { data: companyRow } = await supabase
      .from("companies")
      .select("id")
      .limit(1)
      .single();
    if (!companyRow) return apiError("No company found for demo", 500);
    const companyId = (companyRow as { id: string }).id;

    const { data: tenders } = await supabase
      .from("tenders")
      .select("id")
      .in("status", ["open", "closing_soon"])
      .limit(tenderCount);
    const tenderIds = ((tenders ?? []) as { id: string }[]).map((t) => t.id);
    if (tenderIds.length === 0)
      return apiError("No open tenders found for demo", 500);

    const jobs = tenderIds.map((tenderId) => ({
      jobType: "tender_matching" as const,
      entityType: "tender" as const,
      entityId: tenderId,
      companyId,
      tenderId,
      priority: 5,
      metadata: {
        demo: true,
        model,
        batchLabel: "User A",
        ...(reasoningEffort && { reasoningEffort }),
      } as Record<string, unknown>,
    }));

    const { batchId, jobIds } = await enqueueBatch(
      jobs,
      "demo",
      undefined,
      companyId,
    );

    const baseUrl = process.env.PLATFORM_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/queue/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchSize: 10,
        maxDurationMs: 50000,
        selfTrigger: true,
        concurrency: 5,
      }),
    }).catch((err) => console.error("Demo worker trigger failed:", err));

    await logApiEvent(request, {
      actionType: "admin_demo_sync_run",
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        batchId,
        jobCount: jobIds.length,
        model,
        tenderCount: tenderIds.length,
      },
    }).catch(() => {});

    return apiResponse({ batchId, jobCount: jobIds.length });
  } catch (e) {
    console.error("Demo run error:", e);
    return apiError(e instanceof Error ? e.message : "Demo run failed", 500);
  }
}
