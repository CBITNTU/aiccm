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

const CRON_SECRET = process.env.CRON_SECRET;
const TENDER_SYNC_SECRET = process.env.TENDER_SYNC_SECRET || CRON_SECRET;

function isCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
}

function getOrigin(request: NextRequest): string {
  const url = request.url;
  if (process.env.PLATFORM_URL) return process.env.PLATFORM_URL.replace(/\/$/, "");
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

export type TenderSyncRunStats = {
  findTender: { imported: number; fetched: number; duplicatesSkipped: number };
  ted: { imported: number; fetched: number; duplicatesSkipped: number };
};

async function runTenderSync(
  origin: string,
  secret: string,
): Promise<TenderSyncRunStats> {
  const dateTo = new Date();
  const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dateFromISO = dateFrom.toISOString();
  const dateToISO = dateTo.toISOString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tender-Sync-Secret": secret,
  };

  const stats: TenderSyncRunStats = {
    findTender: { imported: 0, fetched: 0, duplicatesSkipped: 0 },
    ted: { imported: 0, fetched: 0, duplicatesSkipped: 0 },
  };

  // Find a Tender: paginate with cursor
  let cursor: string | undefined;
  do {
    const body = {
      adminImport: true,
      limit: 100,
      cursor,
      filters: { dateFrom: dateFromISO, dateTo: dateToISO },
    };
    const res = await fetch(`${origin}/api/fetch-uk-tenders`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Find a Tender sync failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    stats.findTender.imported += data.actuallyImported ?? 0;
    stats.findTender.fetched += data.totalFetched ?? 0;
    stats.findTender.duplicatesSkipped += data.duplicatesSkipped ?? 0;
    cursor = data.nextCursor ?? undefined;
    if (cursor) await new Promise((r) => setTimeout(r, 1000));
  } while (cursor);

  // TED: paginate with iterationNextToken / nextPage
  // TED rate-limits at ~10 req/burst even with API key, so use max page size (250) and 3s delay
  // Default to English; add more ISO 639-3 codes here to expand (e.g. "FRA", "DEU")
  const tedLanguages = ["ENG"];
  let nextToken: string | undefined;
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const body = {
      adminImport: true,
      page,
      limit: 250,
      iterationNextToken: nextToken,
      dateFrom: dateFromISO,
      dateTo: dateToISO,
      languages: tedLanguages,
    };
    const res = await fetch(`${origin}/api/fetch-ted-tenders`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TED sync failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    stats.ted.imported += data.actuallyImported ?? 0;
    stats.ted.fetched += data.totalFetched ?? 0;
    stats.ted.duplicatesSkipped += data.duplicatesSkipped ?? 0;
    hasMore = data.hasMore === true && (data.nextToken || data.nextPage);
    if (data.nextToken) nextToken = data.nextToken;
    else if (data.nextPage) page = data.nextPage;
    else hasMore = false;
    if (hasMore) await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(
    `[Tender sync] Find a Tender (last 7 days): ${stats.findTender.imported} imported, ${stats.findTender.fetched} fetched, ${stats.findTender.duplicatesSkipped} duplicates skipped`,
  );
  console.log(
    `[Tender sync] TED (last 7 days): ${stats.ted.imported} imported, ${stats.ted.fetched} fetched, ${stats.ted.duplicatesSkipped} duplicates skipped`,
  );
  console.log(
    `[Tender sync] Total new this run: ${stats.findTender.imported + stats.ted.imported}`,
  );

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

    if (!TENDER_SYNC_SECRET) {
      return apiError("TENDER_SYNC_SECRET (or CRON_SECRET) not configured", 500);
    }

    const origin = getOrigin(request);
    let syncSucceeded = false;
    try {
      await runTenderSync(origin, TENDER_SYNC_SECRET);
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
