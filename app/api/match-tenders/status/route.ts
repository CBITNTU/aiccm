import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { createAdminClient } from "@/lib/api";
import { getMatchingJobsForCompany } from "@/lib/services/queueService";

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's company
    const adminSupabase = createAdminClient();
    const { data: companies, error: companyError } = await adminSupabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (companyError || !companies || companies.length === 0) {
      return NextResponse.json(
        { success: false, error: "Company not found for user" },
        { status: 404 }
      );
    }

    const companyId = (companies[0] as { id: string }).id;

    // Get matching jobs status
    const jobs = await getMatchingJobsForCompany(companyId);

    // Calculate estimated time remaining (rough estimate: 5 seconds per job)
    const estimatedSeconds = jobs.processing * 5 + jobs.pending * 5;

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
      { status: 500 }
    );
  }
}
