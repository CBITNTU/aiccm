import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, checkSuperadminRole, apiResponse, apiError } from "@/lib/api";
import { updateActiveCapabilities } from "@/lib/services/capabilityService";
import { logApiEvent } from "@/lib/services/eventLogger";

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return apiError("Authentication required", 401);
    }

    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) {
      return apiError("Superadmin access required", 403);
    }

    const result = await updateActiveCapabilities();

    await logApiEvent(request, {
      actionType: "company_capabilities_updated" as any, // Custom action type
      userId: user.id,
      userEmail: user.email || undefined,
      details: result,
    });

    return apiResponse(result);
  } catch (error) {
    console.error("Error updating active capabilities:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
