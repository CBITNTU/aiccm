import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { aiGenerateText } from "@/lib/ai";
import { logApiEvent } from "@/lib/services/eventLogger";
import { z } from "zod";
import {
  requireAuth,
  validateBody,
  sanitizeTextInput,
  handleApiError,
} from "@/lib/api/validation";

const chatAdvisorInputSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

const SYSTEM_PROMPT = `You are a helpful business advisor for a tender matching platform. Provide practical, actionable advice in a friendly and professional tone. Keep responses concise but informative. Topics: profile optimization, tender strategies, partnerships.`;

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const { prompt } = await validateBody(request, chatAdvisorInputSchema);
    const sanitizedPrompt = sanitizeTextInput(prompt, 2000);

    const response = await aiGenerateText({
      system: SYSTEM_PROMPT,
      prompt: sanitizedPrompt,
      maxTokens: 500,
      temperature: 0.7,
    });

    await logApiEvent(request, {
      actionType: "chat_advisor_used",
      userId: user.id,
    }).catch(() => {});

    return apiResponse({ response });
  } catch (error) {
    return handleApiError(error);
  }
}
