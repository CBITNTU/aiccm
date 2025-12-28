import { NextRequest } from "next/server";
import { chatCompletion, apiResponse, apiError } from "@/lib/api";

const SYSTEM_PROMPT = `You are a tender analysis expert. Respond with valid JSON only.`;

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return apiError("Prompt is required", 400);
    }

    const response = await chatCompletion(SYSTEM_PROMPT, prompt, {
      maxTokens: 2000,
      temperature: 0.7,
    });

    // Clean markdown code blocks from response
    const cleanContent = response
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    return apiResponse({ content: cleanContent });
  } catch (error) {
    console.error("Analyze project simple error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(message, 500);
  }
}
