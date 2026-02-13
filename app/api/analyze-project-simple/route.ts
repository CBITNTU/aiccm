import { NextRequest } from "next/server";
import { createApiClient, apiResponse, apiError } from "@/lib/api";
import { aiGenerateText } from "@/lib/ai";
import { logApiEvent } from "@/lib/services/eventLogger";

const SYSTEM_PROMPT = `You are a tender analysis expert. Respond with valid JSON only. Keep response concise.`;

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return apiError("Prompt is required", 400);
    }

    const response = await aiGenerateText({
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 10000,
      temperature: 0.2,
    });

    // Clean markdown code blocks from response
    const cleanContent = response
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

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

    await logApiEvent(request, {
      actionType: "project_analyzed",
      userId: userId || undefined,
    }).catch(() => {});

    return apiResponse({ content: cleanContent });
  } catch (error) {
    console.error("Analyze project simple error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
