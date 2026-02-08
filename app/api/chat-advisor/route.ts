import { NextRequest } from "next/server";
import {
  chatCompletion,
  createApiClient,
  apiResponse,
  apiError,
} from "@/lib/api";
import { logApiEvent } from "@/lib/services/eventLogger";

const SYSTEM_PROMPT = `You are a helpful business advisor for a tender matching platform. Provide practical, actionable advice in a friendly and professional tone. Keep responses concise but informative. Topics: profile optimization, tender strategies, partnerships.`;

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return apiError("Prompt is required", 400);
    }

    const response = await chatCompletion(SYSTEM_PROMPT, prompt, {
      maxTokens: 500,
      temperature: 0.7,
    });

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
      actionType: "chat_advisor_used",
      userId: userId || undefined,
    }).catch(() => {});

    return apiResponse({ response });
  } catch (error) {
    console.error("Chat advisor error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiResponse(
      {
        error: message,
        response:
          "I'm experiencing technical difficulties. Please try asking about profile optimization, tender strategies, or partnership opportunities.",
      },
      500,
    );
  }
}
