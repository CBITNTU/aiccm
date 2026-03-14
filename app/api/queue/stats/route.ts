import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { getQueueStats } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function GET(request: NextRequest) {
  try {
    const stats = await getQueueStats();

    let userId: string | undefined;
    try {
      const { user } = await getAuthenticatedUser(request);
      userId = user?.id;
    } catch {
      // Optional auth
    }

    await logApiEvent(request, {
      actionType: "queue_stats_viewed",
      userId: userId || undefined,
    }).catch(() => {});

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("Failed to get queue stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
