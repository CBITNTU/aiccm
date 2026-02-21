import { NextRequest } from "next/server";
import { getAuthenticatedUser, apiResponse, apiError, checkSuperadminRole } from "@/lib/api";
import { getTenderSyncSchedule } from "@/lib/services/tenderSyncSchedule";

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);
    if (authError || !user) {
      return apiError("Authentication required", 401);
    }
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) {
      return apiError("Superadmin access required", 403);
    }

    const schedule = await getTenderSyncSchedule();
    return apiResponse({
      lastSyncFinishedAt: schedule.lastSyncFinishedAt,
      nextSyncScheduledAt: schedule.nextSyncScheduledAt,
    });
  } catch (error) {
    console.error("Error in tender-sync-status:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
