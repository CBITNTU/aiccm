import { NextRequest } from "next/server";
import { chatCompletion, apiResponse, apiError } from "@/lib/api";

const SYSTEM_PROMPT = `You are a helpful business advisor for a tender matching platform. Provide practical, actionable advice in a friendly and professional tone. Keep responses concise but informative.`;

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
      500
    );
  }
}
