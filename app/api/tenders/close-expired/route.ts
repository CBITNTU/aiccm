import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { tenders } from "@/lib/db/schema/app";
import { inArray, lt, and } from "drizzle-orm";

/**
 * Cron endpoint to auto-close tenders whose deadline has passed.
 * Runs daily at midnight UTC (configured in vercel.json).
 */
export async function GET(request: NextRequest) {
  // Verify cron secret in production to prevent unauthorized calls
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return apiError("Unauthorized", 401);
    }
  }

  try {
    const data = await db
      .update(tenders)
      .set({ status: "closed" })
      .where(
        and(
          inArray(tenders.status, ["open", "closing_soon", "framework"]),
          lt(tenders.deadline, new Date()),
        ),
      )
      .returning({ id: tenders.id });

    const closedCount = data.length;
    console.log(`[close-expired-tenders] Closed ${closedCount} expired tenders`);

    return apiResponse({ closed: closedCount });
  } catch (error) {
    console.error("[close-expired-tenders] Error:", error);
    return apiError("Failed to close expired tenders", 500);
  }
}
