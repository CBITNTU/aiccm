import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, checkSuperadminRole } from "@/lib/api";
import { getQueueStats } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Superadmin access required" },
        { status: 403 },
      );
    }

    const stats = await getQueueStats();

    await logApiEvent(request, {
      actionType: "queue_stats_viewed",
      userId: user.id,
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
