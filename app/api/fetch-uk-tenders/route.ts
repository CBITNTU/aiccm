import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { findTenderAdapter } from "@/lib/tenders/adapters/findTender";
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
      const auth = await getAuthenticatedUser(request);
      user = auth.user;
      if (!user) {
        return apiError("Authorization required", 401);
      }
      isAdmin = await checkSuperadminRole(user.id);
    }

    const {
      searchTerm,
      limit = 100,
      cursor,
      adminImport = false,
      filters,
    } = await request.json();

    if (adminImport && !isAdmin) {
      return apiError("Superadmin access required to import tenders", 403);
    }

    const { tenders: tendersData, hasMore, nextCursor } =
      await findTenderAdapter.fetch({
        searchTerm,
        limit,
        cursor,
        isAdmin,
        filters,
      });

    if (adminImport && isAdmin && tendersData.length > 0) {
      const result = await ingestTenders(tendersData, findTenderAdapter, {
        request,
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? undefined,
      });

      return apiResponse({
        tenders: tendersData.map(toFeedRecord),
        total: tendersData.length,
        totalFetched: result.totalFetched,
        actuallyImported: result.newCount,
        hasMore,
        nextCursor: isAdmin ? nextCursor : null,
        isAdmin,
        source: "find_tender_api",
        duplicatesSkipped: result.duplicatesCount,
      });
    }

    return apiResponse({
      tenders: tendersData.map(toFeedRecord),
      total: tendersData.length,
      totalFetched: tendersData.length,
      hasMore: !!nextCursor && isAdmin,
      nextCursor: isAdmin ? nextCursor : null,
      isAdmin,
      source: "find_tender_api",
      duplicatesSkipped: 0,
    });
  } catch (error) {
    console.error("Error in fetch-uk-tenders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiResponse(
      {
        error: message,
        tenders: [],
        total: 0,
        page: 1,
        totalPages: 0,
        isAdmin: false,
        message: "Unable to fetch tenders. Please try again later.",
      },
      500,
    );
  }
}
