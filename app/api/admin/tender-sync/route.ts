import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import {
  getTenderSyncSchedule,
  setTenderSyncSchedule,
} from "@/lib/services/tenderSyncSchedule";
import { getAdaptersForProfile } from "@/lib/tenders/registry";
import { ingestTenders } from "@/lib/tenders/ingest";
import type { TenderFetchParams } from "@/lib/tenders/types";

const CRON_SECRET = process.env.CRON_SECRET;

function isCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
}

export type TenderSyncSourceStats = {
  imported: number;
  fetched: number;
  duplicatesSkipped: number;
};

export type TenderSyncRunStats = Record<string, TenderSyncSourceStats>;

const PAGE_LIMIT = 250;

/**
 * Run a full sync over every tender source enabled for the active deployment profile.
 * Each adapter is paginated in-process (cursor / token / page, whichever it returns)
 * and persisted through the shared ingest tail.
 */
async function runTenderSync(request: NextRequest): Promise<TenderSyncRunStats> {
  const dateFromISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dateToISO = new Date().toISOString();
  const stats: TenderSyncRunStats = {};

  for (const adapter of getAdaptersForProfile()) {
    const sourceStats: TenderSyncSourceStats = {
      imported: 0,
      fetched: 0,
      duplicatesSkipped: 0,
    };
    stats[adapter.id] = sourceStats;

    const baseParams: TenderFetchParams = {
      isAdmin: true,
      limit: PAGE_LIMIT,
      filters: { dateFrom: dateFromISO, dateTo: dateToISO },
    };
    let cursor: string | undefined;
    let iterationNextToken: string | undefined;
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await adapter.fetch({
        ...baseParams,
        cursor,
        iterationNextToken,
        page,
      });

      if (result.tenders.length > 0) {
        const ingested = await ingestTenders(result.tenders, adapter, { request });
        sourceStats.imported += ingested.newCount;
        sourceStats.fetched += ingested.totalFetched;
        sourceStats.duplicatesSkipped += ingested.duplicatesCount;
      }

      // Advance pagination using whichever cursor the adapter returned.
      hasMore = result.hasMore === true;
      if (hasMore && result.nextCursor) {
        cursor = result.nextCursor;
      } else if (hasMore && result.nextToken) {
        iterationNextToken = result.nextToken;
      } else if (hasMore && result.nextPage) {
        page = result.nextPage;
      } else {
        hasMore = false;
      }

      if (hasMore && adapter.syncDelayMs) {
        await new Promise((r) => setTimeout(r, adapter.syncDelayMs));
      }
    }

    console.log(
      `[Tender sync] ${adapter.label} (last 7 days): ${sourceStats.imported} imported, ${sourceStats.fetched} fetched, ${sourceStats.duplicatesSkipped} duplicates skipped`,
    );
  }

  const totalImported = Object.values(stats).reduce((n, s) => n + s.imported, 0);
  console.log(`[Tender sync] Total new this run: ${totalImported}`);

  return stats;
}

export async function GET(request: NextRequest) {
  return handleRequest(request, { triggerNow: false });
}

export async function POST(request: NextRequest) {
  let triggerNow = false;
  try {
    const body = await request.json().catch(() => ({}));
    triggerNow = body.triggerNow === true;
  } catch {
    // Optional body; ignore parse failure
  }
  return handleRequest(request, { triggerNow });
}

async function handleRequest(
  request: NextRequest,
  options: { triggerNow: boolean },
) {
  try {
    const cron = isCronRequest(request);
    if (!cron) {
      const { user, error: authError } = await getAuthenticatedUser(request);
      if (authError || !user) {
        return apiError("Authentication required", 401);
      }
      const isAdmin = await checkSuperadminRole(user.id);
      if (!isAdmin) {
        return apiError("Superadmin access required", 403);
      }
    }

    const schedule = await getTenderSyncSchedule();
    const now = new Date();
    const nextDue = schedule.nextSyncScheduledAt
      ? new Date(schedule.nextSyncScheduledAt).getTime() <= now.getTime()
      : true;
    const shouldRun = options.triggerNow || (cron && nextDue);

    if (!shouldRun) {
      return apiResponse({
        ran: false,
        message: "Sync not due",
        lastSyncFinishedAt: schedule.lastSyncFinishedAt,
        nextSyncScheduledAt: schedule.nextSyncScheduledAt,
      });
    }

    let syncSucceeded = false;
    try {
      await runTenderSync(request);
      syncSucceeded = true;
    } catch (err) {
      console.error("Tender sync error:", err);
    }

    const finishedAt = new Date();
    const nextAt = new Date(finishedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    // Only set lastSyncFinishedAt when sync actually succeeded; always set next run
    await setTenderSyncSchedule({
      ...(syncSucceeded && {
        lastSyncFinishedAt: finishedAt.toISOString(),
      }),
      nextSyncScheduledAt: nextAt,
    });

    const updated = await getTenderSyncSchedule();
    return apiResponse({
      ran: true,
      syncSucceeded,
      lastSyncFinishedAt: updated.lastSyncFinishedAt,
      nextSyncScheduledAt: updated.nextSyncScheduledAt,
    });
  } catch (error) {
    console.error("Error in tender-sync:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
