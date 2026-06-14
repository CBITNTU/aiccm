import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { resolveMatchingJobMetadata } from "@/lib/services/tenderMatchingService";

/** Effective LLM used for deep tender matching (platform default or dev override). */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { matchingModel } = await resolveMatchingJobMetadata();
    return apiResponse({ matchingModel });
  } catch (error) {
    return handleApiError(error);
  }
}
