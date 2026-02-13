import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { getPlatformAISettings } from "@/lib/platformSettings";

/**
 * Resolve a model ID string to a Vercel AI SDK LanguageModel.
 * Extension point for future providers (DeepSeek, Gemini, etc.).
 */
export function resolveModel(modelId: string): LanguageModel {
  // For now, all models go through the OpenAI provider.
  // Future: add branching for "deepseek-*", "gemini-*", etc.
  return openai(modelId);
}

/**
 * Get the platform-configured default model and reasoning effort.
 */
export async function getPlatformModel(): Promise<{
  model: LanguageModel;
  modelId: string;
  reasoningEffort: string | undefined;
}> {
  const settings = await getPlatformAISettings();
  const modelId = settings.default_ai_model;
  const reasoningEffort =
    settings.default_reasoning_effort === "default"
      ? undefined
      : settings.default_reasoning_effort;

  return {
    model: resolveModel(modelId),
    modelId,
    reasoningEffort,
  };
}

/** Models available for admin selection. */
export const SUPPORTED_MODELS = [
  { id: "gpt-5-nano", name: "GPT-5 Nano", provider: "openai" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
] as const;
