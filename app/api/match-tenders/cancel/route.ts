import { NextRequest } from "next/server";
import {
  getAuthenticatedUser,
  apiResponse,
  apiError,
  createApiClient,
  createAdminClient,
} from "@/lib/api";
import { getBatchStatus } from "@/lib/services/queueService";

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);
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

    // Verify user has access to this batch
    if (batchStatus.companyId) {
      const supabase = await createApiClient();
      const { data: company } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", batchStatus.companyId)
        .single();

      if (!company || company.user_id !== user.id) {
        return apiError("Access denied", 403);
      }
    }

    // Only allow cancelling if batch is still processing
    if (batchStatus.status !== "processing") {
      return apiError(`Batch is already ${batchStatus.status}`, 400);
    }

    const supabase = createAdminClient();

    // Mark batch as failed (cancelled)
    const { error: batchError } = await supabase
      .from("batch_jobs" as any)
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (batchError) {
      return apiError(`Failed to cancel batch: ${batchError.message}`, 500);
    }

    // Cancel all pending/processing jobs in this batch
    const { error: cancelError, count: cancelledCount } = await supabase
      .from("processing_queue" as any)
      .update({
        status: "failed",
        error_message: "Cancelled by user",
        updated_at: new Date().toISOString(),
      })
      .eq("batch_id", batchId)
      .in("status", ["pending", "processing"]);

    if (cancelError) {
      console.error(`Failed to cancel jobs for batch ${batchId}:`, cancelError);
    } else {
      console.log(`✅ Cancelled ${cancelledCount || 0} jobs for batch ${batchId}`);
    }

    return apiResponse({
      message: "Matching cancelled successfully",
      batch_id: batchId,
      cancelled_jobs: cancelledCount || 0,
    });
  } catch (error) {
    console.error("Error cancelling matching:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
