import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, checkSuperadminRole } from "@/lib/api";
import { isCompanyMember } from "@/lib/api/validation";
import { enqueueJob } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { companyId, jobTypes, fullRegeneration } = await request.json();

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "Company ID required" },
        { status: 400 },
      );
    }

    const isSuperadmin = await checkSuperadminRole(user.id);
    if (!isSuperadmin) {
      const hasCompanyAccess = await isCompanyMember(user.id, companyId);
      if (!hasCompanyAccess) {
        return NextResponse.json(
          { success: false, error: "No access to this company" },
          { status: 403 },
        );
      }
    }

    const jobsToQueue = jobTypes || ["company_summary", "company_taxonomy"];
    const jobIds: string[] = [];

    for (const jobType of jobsToQueue) {
      if (jobType === "company_summary" || jobType === "company_taxonomy") {
        try {
          const jobId = await enqueueJob({
            jobType: jobType as "company_summary" | "company_taxonomy",
            entityType: "company",
            entityId: companyId,
            priority: 3,
            metadata: fullRegeneration ? { fullRegeneration: true } : undefined, // Pass flag to worker
          });
          jobIds.push(jobId);
        } catch (error) {
          console.error(`Failed to queue ${jobType}:`, error);
        }
      }
    }

    // Log queue job creation
    await logApiEvent(request, {
      actionType: "queue_job_created",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: {
        jobIds,
        jobTypes,
        queued: jobIds.length,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      jobIds,
      queued: jobIds.length,
    });
  } catch (error) {
    console.error("Error queueing company AI jobs:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
