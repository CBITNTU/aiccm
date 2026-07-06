import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  apiResponse,
  apiError,
  checkSuperadminRole,
} from "@/lib/api";
import { shanghaiZbycgAdapter } from "@/lib/tenders/adapters/shanghai";
import { ingestTenders } from "@/lib/tenders/ingest";
import { toFeedRecord } from "@/lib/tenders/mapTenderToInsert";

// The scrape fans out to per-notice detail pages (throttled), so it can run long.
// Backs the internal pacing; Fluid Compute allows 300s on every plan.
export const maxDuration = 300;

const TENDER_SYNC_SECRET = process.env.TENDER_SYNC_SECRET || process.env.CRON_SECRET;

function isTenderSyncRequest(request: NextRequest): boolean {
  const secret = request.headers.get("X-Tender-Sync-Secret");
  return !!TENDER_SYNC_SECRET && secret === TENDER_SYNC_SECRET;
}

/** Coerce an untrusted value to an integer in [min, max], falling back to `fallback`. */
function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * China-only tender source: scrapes the Shanghai listing on zbycg.com. Mirrors the
 * UK/TED admin import routes (paginated import gated behind superadmin), but paginates
 * by page number (`page`/`nextPage`) since the source has no cursor/token.
 */
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

    const { searchTerm, page: rawPage, adminImport = false } = await request.json();
    const page = clampInt(rawPage, 1, 1, 20);

    if (adminImport && !isAdmin) {
      return apiError("Superadmin access required to import tenders", 403);
    }

    const { tenders: tendersData, hasMore, nextPage } =
      await shanghaiZbycgAdapter.fetch({ searchTerm, page, isAdmin });

    if (adminImport && isAdmin && tendersData.length > 0) {
      const result = await ingestTenders(tendersData, shanghaiZbycgAdapter, {
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
        nextPage: isAdmin ? nextPage : null,
        isAdmin,
        source: "shanghai_zbycg",
        duplicatesSkipped: result.duplicatesCount,
      });
    }

    return apiResponse({
      tenders: tendersData.map(toFeedRecord),
      total: tendersData.length,
      totalFetched: tendersData.length,
      hasMore: isAdmin && hasMore,
      nextPage: isAdmin ? nextPage : null,
      isAdmin,
      source: "shanghai_zbycg",
      duplicatesSkipped: 0,
    });
  } catch (error) {
    console.error("Error in fetch-shanghai-tenders:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiResponse(
      {
        error: message,
        tenders: [],
        total: 0,
        isAdmin: false,
        message: "Unable to fetch Shanghai tenders. Please try again later.",
      },
      500,
    );
  }
}
