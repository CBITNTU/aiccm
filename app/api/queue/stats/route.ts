import { NextResponse } from "next/server";
import { getQueueStats } from "@/lib/services/queueService";

export async function GET() {
  try {
    const stats = await getQueueStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("Failed to get queue stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
