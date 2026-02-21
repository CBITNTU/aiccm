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

async function runTenderSync(origin: string, secret: string): Promise<void> {
  const dateTo = new Date();
  const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dateFromISO = dateFrom.toISOString();
  const dateToISO = dateTo.toISOString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tender-Sync-Secret": secret,
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
    cursor = data.nextCursor ?? undefined;
    if (cursor) await new Promise((r) => setTimeout(r, 1000));
  } while (cursor);

  // TED: paginate with iterationNextToken / nextPage
  let nextToken: string | undefined;
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const body = {
      adminImport: true,
      page,
      limit: 100,
      iterationNextToken: nextToken,
      dateFrom: dateFromISO,
      dateTo: dateToISO,
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
    hasMore = data.hasMore === true && (data.nextToken || data.nextPage);
    if (data.nextToken) nextToken = data.nextToken;
    else if (data.nextPage) page = data.nextPage;
    else hasMore = false;
    if (hasMore) await new Promise((r) => setTimeout(r, 1000));
  }
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
    try {
      await runTenderSync(origin, TENDER_SYNC_SECRET);
    } catch (err) {
      console.error("Tender sync error:", err);
      // Still update schedule so next run is in 7 days
    }

    const finishedAt = new Date().toISOString();
    const nextAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await setTenderSyncSchedule({
      lastSyncFinishedAt: finishedAt,
      nextSyncScheduledAt: nextAt,
    });

    return apiResponse({
      ran: true,
      lastSyncFinishedAt: finishedAt,
      nextSyncScheduledAt: nextAt,
    });
  } catch (error) {
    console.error("Error in tender-sync:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
