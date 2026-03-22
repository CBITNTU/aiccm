import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import {
  getPlatformVerificationSettings,
  setPlatformVerificationSettings,
} from "@/lib/platformVerificationSettings";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const settings = await getPlatformVerificationSettings();
    return apiResponse(settings);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const body = await request.json();
    const updates: Record<string, number> = {};

    if (typeof body.verifiedProjectLimit === "number" && body.verifiedProjectLimit >= 0) {
      updates.verifiedProjectLimit = body.verifiedProjectLimit;
    }
    if (typeof body.unverifiedProjectLimit === "number" && body.unverifiedProjectLimit >= 0) {
      updates.unverifiedProjectLimit = body.unverifiedProjectLimit;
    }
    if (typeof body.unverifiedCompetencyLimit === "number" && body.unverifiedCompetencyLimit >= 0) {
      updates.unverifiedCompetencyLimit = body.unverifiedCompetencyLimit;
    }

    if (Object.keys(updates).length === 0) {
      return apiResponse({ error: "No valid settings provided" }, 400);
    }

    await setPlatformVerificationSettings(updates);
    const settings = await getPlatformVerificationSettings();
    return apiResponse(settings);
  } catch (error) {
    return handleApiError(error);
  }
}
