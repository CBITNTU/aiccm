import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  checkSuperadminRole,
  apiResponse,
  apiError,
} from "@/lib/api";
import { enqueueBatch } from "@/lib/services/queueService";
import { getPlatformAISettings } from "@/lib/platformSettings";
import type { MatchingModelId } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companies, tenders } from "@/lib/db/schema/app";
import { inArray } from "drizzle-orm";

const DEFAULT_MATCH_COUNT = 50;

/**
 * POST /api/admin/demo-sync/add-user
 * Body: { matchCount?: number, model: "gpt-5-nano" }
 * Enqueues another batch of demo matching jobs (batchLabel "User B") without truncating.
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
    const matchCount = Math.min(
      100,
      Math.max(1, Number(body.matchCount) || DEFAULT_MATCH_COUNT),
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

    // Get first company
    const companyRows = await db
      .select({ id: companies.id })
      .from(companies)
      .limit(1);
    if (!companyRows[0]) return apiError("No company found for demo", 500);
    const companyId = companyRows[0].id;

    // Get open tenders
    const tenderRows = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(inArray(tenders.status, ["open", "closing_soon"]))
      .limit(matchCount);
    const tenderIds = tenderRows.map((t) => t.id);
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
        batchLabel: "User B",
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
    }).catch((err) =>
      console.error("Demo add-user worker trigger failed:", err),
    );

    await logApiEvent(request, {
      actionType: "admin_demo_sync_add_user",
      userId: user.id,
      userEmail: user.email || undefined,
      details: {
        batchId,
        jobCount: jobIds.length,
        model,
        matchCount: tenderIds.length,
      },
    }).catch(() => {});

    return apiResponse({ batchId, jobCount: jobIds.length });
  } catch (e) {
    console.error("Demo add-user error:", e);
    return apiError(
      e instanceof Error ? e.message : "Add user to queue failed",
      500,
    );
  }
}
