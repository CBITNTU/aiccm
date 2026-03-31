import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import {
  getPlatformVerificationSettings,
  setPlatformVerificationSettings,
} from "@/lib/platformVerificationSettings";
import {
  getPlatformMatchingSettings,
  setPlatformMatchingSettings,
} from "@/lib/platformMatchingSettings";
import {
  getPlatformAnalysisSettings,
  setPlatformAnalysisSettings,
} from "@/lib/platformAnalysisSettings";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const [verificationSettings, matchingSettings, analysisSettings] = await Promise.all([
      getPlatformVerificationSettings(),
      getPlatformMatchingSettings(),
      getPlatformAnalysisSettings(),
    ]);
    return apiResponse({ ...verificationSettings, ...matchingSettings, ...analysisSettings });
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
    const verificationUpdates: Record<string, number> = {};
    const matchingUpdates: Record<string, number> = {};
    const analysisUpdates: Record<string, number> = {};

    if (typeof body.verifiedProjectLimit === "number" && body.verifiedProjectLimit >= 0) {
      verificationUpdates.verifiedProjectLimit = body.verifiedProjectLimit;
    }
    if (typeof body.unverifiedProjectLimit === "number" && body.unverifiedProjectLimit >= 0) {
      verificationUpdates.unverifiedProjectLimit = body.unverifiedProjectLimit;
    }
    if (typeof body.unverifiedCompetencyLimit === "number" && body.unverifiedCompetencyLimit >= 0) {
      verificationUpdates.unverifiedCompetencyLimit = body.unverifiedCompetencyLimit;
    }
    if (typeof body.verifiedMatchingRunsPerMonth === "number" && body.verifiedMatchingRunsPerMonth >= 0) {
      matchingUpdates.verifiedMatchingRunsPerMonth = body.verifiedMatchingRunsPerMonth;
    }
    if (typeof body.unverifiedMatchingRunsPerMonth === "number" && body.unverifiedMatchingRunsPerMonth >= 0) {
      matchingUpdates.unverifiedMatchingRunsPerMonth = body.unverifiedMatchingRunsPerMonth;
    }
    if (typeof body.verifiedAnalysisRunsPerMonth === "number" && body.verifiedAnalysisRunsPerMonth >= 0) {
      analysisUpdates.verifiedAnalysisRunsPerMonth = body.verifiedAnalysisRunsPerMonth;
    }
    if (typeof body.unverifiedAnalysisRunsPerMonth === "number" && body.unverifiedAnalysisRunsPerMonth >= 0) {
      analysisUpdates.unverifiedAnalysisRunsPerMonth = body.unverifiedAnalysisRunsPerMonth;
    }

    if (Object.keys(verificationUpdates).length === 0 && Object.keys(matchingUpdates).length === 0 && Object.keys(analysisUpdates).length === 0) {
      return apiResponse({ error: "No valid settings provided" }, 400);
    }

    await Promise.all([
      Object.keys(verificationUpdates).length > 0
        ? setPlatformVerificationSettings(verificationUpdates)
        : Promise.resolve(),
      Object.keys(matchingUpdates).length > 0
        ? setPlatformMatchingSettings(matchingUpdates)
        : Promise.resolve(),
      Object.keys(analysisUpdates).length > 0
        ? setPlatformAnalysisSettings(analysisUpdates)
        : Promise.resolve(),
    ]);

    const [verificationSettings, matchingSettings, analysisSettings] = await Promise.all([
      getPlatformVerificationSettings(),
      getPlatformMatchingSettings(),
      getPlatformAnalysisSettings(),
    ]);
    return apiResponse({ ...verificationSettings, ...matchingSettings, ...analysisSettings });
  } catch (error) {
    return handleApiError(error);
  }
}
