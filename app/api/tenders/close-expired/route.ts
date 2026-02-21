import { NextRequest } from "next/server";
import { apiResponse, apiError, createAdminClient } from "@/lib/api";

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
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("tenders")
      .update({ status: "closed" })
      .in("status", ["open", "closing_soon", "framework"])
      .lt("deadline", new Date().toISOString())
      .select("id");

    if (error) throw error;

    const closedCount = data?.length ?? 0;
    console.log(`[close-expired-tenders] Closed ${closedCount} expired tenders`);

    return apiResponse({ closed: closedCount });
  } catch (error) {
    console.error("[close-expired-tenders] Error:", error);
    return apiError("Failed to close expired tenders", 500);
  }
}
