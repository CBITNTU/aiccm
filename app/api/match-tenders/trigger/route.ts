import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api";
import { batchScoreTendersForCompany } from "@/lib/services/tenderMatchingService";
import { logApiEvent } from "@/lib/services/eventLogger";
import { getUserCompanyIds } from "@/lib/api/validation";

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { tenderIds } = await request.json().catch(() => ({}));

    // Get user's companies (owned + team memberships)
    const companyIds = await getUserCompanyIds(user.id);

    if (companyIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Company not found for user" },
        { status: 404 },
      );
    }

    const companyId = companyIds[0];

    // Queue matching jobs
    const { jobCount, batchId } = await batchScoreTendersForCompany(
      companyId,
      tenderIds && Array.isArray(tenderIds) ? tenderIds : undefined,
    );

    // Log matching trigger event
    await logApiEvent(request, {
      actionType: "matching_triggered",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: {
        jobCount,
        batchId,
        tenderCount:
          tenderIds && Array.isArray(tenderIds) ? tenderIds.length : "all",
      },
    });

    return NextResponse.json({
      success: true,
      jobCount,
      companyId,
      batchId,
    });
  } catch (error) {
    console.error("Error triggering matching:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Log error event
    await logApiEvent(request, {
      actionType: "matching_triggered",
      userId: undefined,
      status: "error",
      errorMessage,
    }).catch(() => {}); // Don't fail if logging fails

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
