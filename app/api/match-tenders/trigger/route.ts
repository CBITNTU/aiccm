import { NextRequest } from "next/server";
import { apiResponse, apiError } from "@/lib/api";
import {
  requireAuth,
  handleApiError,
  isCompanyMember,
} from "@/lib/api/validation";
import { batchScoreTendersForCompany } from "@/lib/services/tenderMatchingService";
import { logApiEvent } from "@/lib/services/eventLogger";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { and, eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);

    const body = await request.json().catch(() => ({}));
    const {
      tenderIds,
      companyId: requestedCompanyId,
      force = false,
    } = body as {
      tenderIds?: string[];
      companyId?: string;
      force?: boolean;
    };

    // Deep matches are quota-free, so an unbounded "match everything" run is
    // not allowed here — callers must say which tenders to match.
    if (
      !Array.isArray(tenderIds) ||
      tenderIds.length === 0 ||
      !tenderIds.every((id) => typeof id === "string")
    ) {
      return apiError("tenderIds must be a non-empty array of tender IDs", 400);
    }

    let companyId = requestedCompanyId;

    if (companyId) {
      const hasAccess = await isCompanyMember(user.id, companyId);
      if (!hasAccess) {
        return apiError("Company not found or access denied", 404);
      }
      const [row] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.status, "active")))
        .limit(1);
      if (!row) {
        return apiError("Company not found or not active", 404);
      }
    } else {
      const { getUserCompanyIds } = await import("@/lib/api/validation");
      const companyIds = await getUserCompanyIds(user.id);
      if (companyIds.length === 0) {
        return apiError("Company not found for user", 404);
      }
      companyId = companyIds[0];
    }

    const result = await batchScoreTendersForCompany(
      companyId,
      tenderIds,
      user.id,
      { force: force === true },
    );

    if (result.status === "all_cached") {
      return apiResponse({
        success: true,
        status: "all_cached",
        jobCount: 0,
        skippedCount: result.skippedCount,
        companyId,
        batchId: null,
        matchingModel: result.matchingModel,
      });
    }

    await logApiEvent(request, {
      actionType: "matching_triggered",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "company",
      entityId: companyId,
      details: {
        jobCount: result.jobCount,
        batchId: result.batchId,
        matchingModel: result.matchingModel,
        skippedCount: result.skippedCount,
        tenderCount: tenderIds.length,
        force: force === true,
      },
    });

    return apiResponse({
      success: true,
      status: "queued",
      jobCount: result.jobCount,
      skippedCount: result.skippedCount,
      companyId,
      batchId: result.batchId,
      matchingModel: result.matchingModel,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
