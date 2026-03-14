import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import { requireAuth, handleApiError, getUserCompanyIds } from "@/lib/api/validation";
import { batchScoreTendersForCompany } from "@/lib/services/tenderMatchingService";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { tenders } from "@/lib/db/schema/app";
import { and, inArray, gte } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const { tenderIds } = await request.json().catch(() => ({}));

    // Get user's companies (owned + team memberships)
    const companyIds = await getUserCompanyIds(user.id);

    if (companyIds.length === 0) {
      return apiError("Company not found for user", 404);
    }

    const companyId = companyIds[0];

    // Determine which tender IDs to use — filter by deadline >= today
    let filteredTenderIds: string[] | undefined;
    if (tenderIds && Array.isArray(tenderIds)) {
      filteredTenderIds = tenderIds;
    } else {
      // Fetch open tenders with deadline >= today (same filter as main endpoint)
      const today = new Date().toISOString().split("T")[0];
      const openTenders = await db
        .select({ id: tenders.id })
        .from(tenders)
        .where(
          and(
            inArray(tenders.status, ["open", "closing_soon", "framework"]),
            gte(tenders.deadline, new Date(today)),
          ),
        );

      filteredTenderIds = openTenders.map((t) => t.id);
    }

    // Queue matching jobs
    const { jobCount, batchId } = await batchScoreTendersForCompany(
      companyId,
      filteredTenderIds,
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

    return apiResponse({
      success: true,
      jobCount,
      companyId,
      batchId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
