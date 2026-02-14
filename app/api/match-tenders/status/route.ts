import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { getMatchingJobsForCompany } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";
import { getUserCompanyIds } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Get user's companies (owned + team memberships)
    const companyIds = await getUserCompanyIds(user.id);

    if (companyIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Company not found for user" },
        { status: 404 },
      );
    }

    const companyId = companyIds[0];

    // Get matching jobs status
    const jobs = await getMatchingJobsForCompany(companyId);

    // Calculate estimated time remaining (rough estimate: 5 seconds per job)
    const estimatedSeconds = jobs.processing * 5 + jobs.pending * 5;

    await logApiEvent(request, {
      actionType: "matching_result_viewed",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: { total: jobs.total, completed: jobs.completed },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      total: jobs.total,
      completed: jobs.completed,
      processing: jobs.processing,
      pending: jobs.pending,
      failed: jobs.failed,
      estimatedSeconds,
      results: jobs.results
        .filter((j) => j.status === "completed")
        .map((j) => ({
          tenderId: j.tender_id,
          score: j.result_data as unknown as { overallScore?: number },
          completedAt: j.completed_at,
        })),
    });
  } catch (error) {
    console.error("Error getting matching status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
