import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import {
  getPlatformTenderLimits,
  setPlatformTenderLimits,
  type PlatformTenderLimits,
} from "@/lib/platformTenderSyncSettings";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const limits = await getPlatformTenderLimits();
    return apiResponse(limits);
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
    const updates: Partial<PlatformTenderLimits> = {};
    const fields: (keyof PlatformTenderLimits)[] = [
      "shanghai_zbycg",
      "find_tender",
      "ted",
    ];
    for (const field of fields) {
      if (typeof body[field] === "number" && body[field] >= 1) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return apiResponse({ error: "No valid settings provided" }, 400);
    }

    await setPlatformTenderLimits(updates);
    const limits = await getPlatformTenderLimits();
    return apiResponse(limits);
  } catch (error) {
    return handleApiError(error);
  }
}
