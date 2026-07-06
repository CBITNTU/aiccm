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
import {
  getPlatformTenderLimits,
  type PlatformTenderLimits,
} from "@/lib/platformTenderSyncSettings";

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
/** Hard cap on pages fetched per adapter, so a never-ending upstream cursor can't loop forever. */
const MAX_PAGES_PER_ADAPTER = 100;
/** Wall-clock budget for the whole run; bounds execution under serverless time limits. */
const MAX_RUN_MS = 4 * 60 * 1000;

/**
 * Run a full sync over every tender source enabled for the active deployment profile.
 * Each adapter is paginated in-process (cursor / token / page, whichever it returns)
 * and persisted through the shared ingest tail. Pagination is bounded by a per-adapter
 * page cap and an overall wall-clock deadline so a slow/endless upstream can't hang the
 * request or spawn unbounded embedding/AI jobs.
 */
async function runTenderSync(request: NextRequest): Promise<TenderSyncRunStats> {
  const startedAt = Date.now();
  const deadline = startedAt + MAX_RUN_MS;
  const dateFromISO = new Date(startedAt - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dateToISO = new Date(startedAt).toISOString();
  const stats: TenderSyncRunStats = {};

  // Per-source record caps so a single source can't overfetch (and rack up
  // embedding/AI cost). Sources without a configured limit are unbounded here
  // and still bounded by the page/time backstops below.
  const limits = await getPlatformTenderLimits();

  for (const adapter of getAdaptersForProfile()) {
    if (Date.now() >= deadline) {
      console.warn(`[Tender sync] Run deadline reached; skipping remaining adapters.`);
      break;
    }
    const sourceStats: TenderSyncSourceStats = {
      imported: 0,
      fetched: 0,
      duplicatesSkipped: 0,
    };
    stats[adapter.id] = sourceStats;

    const sourceLimit =
      limits[adapter.id as keyof PlatformTenderLimits] ?? Number.MAX_SAFE_INTEGER;
    let fetchedForSource = 0;

    const baseParams: TenderFetchParams = {
      isAdmin: true,
      limit: PAGE_LIMIT,
      filters: { dateFrom: dateFromISO, dateTo: dateToISO },
    };
    let cursor: string | undefined;
    let iterationNextToken: string | undefined;
    let page = 1;
    let hasMore = true;
    let pagesFetched = 0;

    while (hasMore) {
      if (pagesFetched >= MAX_PAGES_PER_ADAPTER) {
        console.warn(
          `[Tender sync] ${adapter.label}: hit MAX_PAGES_PER_ADAPTER (${MAX_PAGES_PER_ADAPTER}); stopping pagination early.`,
        );
        break;
      }
      if (Date.now() >= deadline) {
        console.warn(
          `[Tender sync] ${adapter.label}: run deadline reached; stopping pagination early.`,
        );
        break;
      }

      const result = await adapter.fetch({
        ...baseParams,
        cursor,
        iterationNextToken,
        page,
      });
      pagesFetched++;

      // Trim the page so we never fetch past the source's configured record cap.
      let pageTenders = result.tenders;
      if (fetchedForSource + pageTenders.length > sourceLimit) {
        pageTenders = pageTenders.slice(0, sourceLimit - fetchedForSource);
      }
      fetchedForSource += pageTenders.length;

      if (pageTenders.length > 0) {
        const ingested = await ingestTenders(pageTenders, adapter, { request });
        sourceStats.imported += ingested.newCount;
        sourceStats.fetched += ingested.totalFetched;
        sourceStats.duplicatesSkipped += ingested.duplicatesCount;
      }

      if (fetchedForSource >= sourceLimit) {
        console.warn(
          `[Tender sync] ${adapter.label}: hit per-source limit (${sourceLimit} tenders); stopping pagination early.`,
        );
        break;
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
