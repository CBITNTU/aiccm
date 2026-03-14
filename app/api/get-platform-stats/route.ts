import { NextRequest } from "next/server";
import { after } from "next/server";
import { apiResponse, apiError, getAuthenticatedUser } from "@/lib/api";
import type { PlatformStats } from "@/lib/api/types";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companies, tenders, matchingResults, virtualOrganizations } from "@/lib/db/schema/app";
import { count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    console.log("Fetching platform statistics...");

    const [companiesRes, tendersRes, matchesRes, projectsRes] =
      await Promise.all([
        db.select({ count: count() }).from(companies),
        db.select({ count: count() }).from(tenders),
        db.select({ count: count() }).from(matchingResults),
        db.select({ count: count() }).from(virtualOrganizations),
      ]);

    const stats: PlatformStats = {
      companies: companiesRes[0]?.count || 0,
      tenders: tendersRes[0]?.count || 0,
      matches: matchesRes[0]?.count || 0,
      projects: projectsRes[0]?.count || 0,
    };

    const { user } = await getAuthenticatedUser(request);
    const userId = user?.id;

    after(() =>
      logApiEvent(request, {
        actionType: "platform_stats_viewed",
        userId: userId || undefined,
        details: { ...stats } as Record<string, unknown>,
      }).catch(() => {}),
    );

    return apiResponse(stats);
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}

// Also support POST for compatibility
export async function POST(request: NextRequest) {
  return GET(request);
}
