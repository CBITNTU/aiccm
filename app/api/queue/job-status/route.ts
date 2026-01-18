import { NextRequest, NextResponse } from "next/server";
import { getBatchStatus, getMatchingJobsForCompany } from "@/lib/services/queueService";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");
    const companyId = searchParams.get("companyId");

    if (batchId) {
      const batch = await getBatchStatus(batchId);
      if (!batch) {
        return NextResponse.json(
          { success: false, error: "Batch not found" },
          { status: 404 }
        );
      }
      
      // Debug logging
      console.log(`📊 Batch status for ${batchId}:`, {
        total: batch.totalJobs,
        completed: batch.completedJobs,
        failed: batch.failedJobs,
        status: batch.status,
        progress: Math.round((batch.completedJobs / batch.totalJobs) * 100),
      });
      
      return NextResponse.json({ success: true, batch });
    }

    if (companyId) {
      const jobs = await getMatchingJobsForCompany(companyId);
      return NextResponse.json({ success: true, jobs });
    }

    return NextResponse.json(
      { success: false, error: "batchId or companyId required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to get job status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
