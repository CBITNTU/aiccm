import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import {
  getBatchStatus,
  getMatchingJobsForCompany,
} from "@/lib/services/queueService";
import { isCompanyMember } from "@/lib/api/validation";
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

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get("batchId");
    const companyId = searchParams.get("companyId");

    if (batchId) {
      const batch = await getBatchStatus(batchId);
      if (!batch) {
        return NextResponse.json(
          { success: false, error: "Batch not found" },
          { status: 404 },
        );
      }

      // Verify user has access to the company associated with this batch
      if (batch.companyId) {
        const hasAccess = await isCompanyMember(user.id, batch.companyId);
        if (!hasAccess) {
          return NextResponse.json(
            { success: false, error: "Forbidden" },
            { status: 403 },
          );
        }
      }

      await logApiEvent(request, {
        actionType: "queue_job_status_viewed",
        userId: user.id,
        entityType: "batch_job",
        entityId: batchId,
        details: {
          total: batch.totalJobs,
          completed: batch.completedJobs,
          status: batch.status,
        },
      }).catch(() => {});

      return NextResponse.json({ success: true, batch });
    }

    if (companyId) {
      // Verify user has access to this company
      const hasAccess = await isCompanyMember(user.id, companyId);
      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }

      const jobs = await getMatchingJobsForCompany(companyId);

      await logApiEvent(request, {
        actionType: "queue_job_status_viewed",
        userId: user.id,
        entityType: "company",
        entityId: companyId,
        details: { total: jobs.total },
      }).catch(() => {});

      return NextResponse.json({ success: true, jobs });
    }

    return NextResponse.json(
      { success: false, error: "batchId or companyId required" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Failed to get job status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
