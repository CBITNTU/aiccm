import { NextRequest } from "next/server";
import { getAuthenticatedUser, apiResponse, apiError } from "@/lib/api";
import {
  getCompanyAccess,
  suppressEmailForAdminOverride,
} from "@/lib/api/companyAccess";
import { getBatchStatus, cancelBatch } from "@/lib/services/queueService";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) {
      return apiError("Unauthorized", 401);
    }

    const body = await request.json().catch(() => ({}));
    const batchId = body.batchId;

    if (!batchId) {
      return apiError("Batch ID is required", 400);
    }

    const batchStatus = await getBatchStatus(batchId);

    if (!batchStatus) {
      return apiError("Batch not found", 404);
    }

    // Owner, team member, or a superadmin preparing the account — the same rule
    // the trigger route uses to start the run.
    if (batchStatus.companyId) {
      const access = await getCompanyAccess(user.id, batchStatus.companyId);
      if (!access.hasAccess) {
        return apiError("Access denied", 403);
      }
      suppressEmailForAdminOverride(access, user.id);
    }

    // Cancel: deletes pending queue items, marks in-flight + batch as cancelled.
    // Idempotent — if the batch already finished, this is a no-op and we still
    // return 200 so the client converges on the terminal state.
    const result = await cancelBatch(batchId);

    console.log(
      result.cancelled
        ? `✅ Cancelled batch ${batchId}: deleted ${result.deletedPending} pending, cancelled ${result.cancelledInFlight} in-flight`
        : `ℹ️ Cancel no-op for batch ${batchId} — already ${result.status}`,
    );

    await logApiEvent(request, {
      actionType: "matching_cancelled",
      userId: user.id,
      userEmail: user.email || undefined,
      entityType: "batch_job",
      entityId: batchId,
      details: {
        cancelled: result.cancelled,
        deleted_pending: result.deletedPending,
        cancelled_in_flight: result.cancelledInFlight,
        status: result.status,
      },
    }).catch(() => {});

    return apiResponse({
      message: result.cancelled
        ? "Matching cancelled successfully"
        : `Batch already ${result.status}`,
      batchId,
      cancelled: result.cancelled,
      status: result.status,
      deletedPending: result.deletedPending,
      cancelledInFlight: result.cancelledInFlight,
    });
  } catch (error) {
    console.error("Error cancelling matching:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
