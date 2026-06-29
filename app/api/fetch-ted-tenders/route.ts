import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { tedAdapter } from "@/lib/tenders/adapters/ted";
import { ingestTenders } from "@/lib/tenders/ingest";
import { toFeedRecord } from "@/lib/tenders/mapTenderToInsert";

const TENDER_SYNC_SECRET = process.env.TENDER_SYNC_SECRET || process.env.CRON_SECRET;

function isTenderSyncRequest(request: NextRequest): boolean {
  const secret = request.headers.get("X-Tender-Sync-Secret");
  return !!TENDER_SYNC_SECRET && secret === TENDER_SYNC_SECRET;
}

export async function POST(request: NextRequest) {
  try {
    const syncBySecret = isTenderSyncRequest(request);
    let user: { id: string; email?: string | null } | null = null;
    let isAdmin = false;

    if (syncBySecret) {
      isAdmin = true;
      console.log("Tender sync: authenticated via X-Tender-Sync-Secret");
    } else {
      const { user: authUser, error: authError } = await getAuthenticatedUser(request);
      user = authUser;
      if (authError || !user) {
        return apiError("Authentication required", 401);
      }
      isAdmin = await checkSuperadminRole(user.id);
      if (!isAdmin) {
        return apiError("Superadmin access required", 403);
      }
    }

    const {
      dateFrom,
      dateTo,
      page = 1,
      limit = 100,
      iterationNextToken,
      adminImport = false,
      languages,
    } = await request.json();

    const { tenders: notices, hasMore, nextToken, nextPage } =
      await tedAdapter.fetch({
        isAdmin,
        limit,
        page,
        iterationNextToken,
        languages,
        filters: { dateFrom, dateTo },
      });

    const emptyMessage =
      notices.length === 0
        ? {
            message:
              "TED returned no notices for this date range. Try a wider range or add TED_API_KEY to .env.local (optional; see https://docs.ted.europa.eu/api/latest/).",
          }
        : {};

    if (adminImport && isAdmin && notices.length > 0) {
      const result = await ingestTenders(notices, tedAdapter, {
        request,
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? undefined,
      });

      return apiResponse({
        tenders: notices.map(toFeedRecord),
        total: notices.length,
        totalFetched: result.totalFetched,
        actuallyImported: result.newCount,
        hasMore,
        nextPage,
        nextToken,
        isAdmin,
        source: "ted_api",
        duplicatesSkipped: result.duplicatesCount,
      });
    }

    return apiResponse({
      tenders: notices.map(toFeedRecord),
      total: notices.length,
      totalFetched: notices.length,
      hasMore,
      nextPage,
      nextToken,
      isAdmin,
      source: "ted_api",
      duplicatesSkipped: 0,
      ...emptyMessage,
    });
  } catch (error) {
    console.error("Error in fetch-ted-tenders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiResponse(
      {
        error: message,
        tenders: [],
        total: 0,
        page: 1,
        totalPages: 0,
        hasMore: false,
        isAdmin: false,
        source: "ted_api",
      },
      500,
    );
  }
}
