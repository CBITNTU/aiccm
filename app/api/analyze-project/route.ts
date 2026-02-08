import { NextRequest } from "next/server";
import { createApiClient, apiResponse, apiError } from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

// This is currently a stub function that returns test data
// The full implementation would analyze Virtual Organization projects

export async function POST(request: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      const supabaseAuth = await createApiClient();
      const {
        data: { user },
      } = await supabaseAuth.auth.getUser();
      userId = user?.id;
    } catch {
      // Optional auth
    }

    // Minimal test response (matching the original Deno stub)
    await logApiEvent(request, {
      actionType: "project_analyzed",
      userId: userId || undefined,
    }).catch(() => {});

    return apiResponse({
      analysis: {
        requiredCompetencies: ["Test"],
        companyCompetencies: ["Test"],
        missingCompetencies: ["Test"],
        coveragePercentage: 50,
        readinessScore: 50,
        risks: ["Test mode - function deployed successfully"],
      },
      recommendedPartners: [],
    });
  } catch (error) {
    console.error("Error in analyze-project:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
