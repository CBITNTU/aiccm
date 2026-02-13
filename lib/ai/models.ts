import { openai } from "@ai-sdk/openai";
import { deepseek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";

/**
 * Resolve a model ID string to a Vercel AI SDK LanguageModel.
 * Routes to the correct provider based on model ID prefix.
 */
export function resolveModel(modelId: string): LanguageModel {
  if (modelId.startsWith("deepseek-")) {
    return deepseek(modelId);
  }
  // Default: OpenAI
  return openai(modelId);
}

/**
 * Derive the provider name from a model ID.
 */
export function getProviderName(modelId: string): string {
  if (modelId.startsWith("deepseek-")) return "deepseek";
  return "openai";
}

/** Models available for admin selection. */
export const SUPPORTED_MODELS = [
  { id: "gpt-5-nano", name: "GPT-5 Nano", provider: "openai" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  { id: "deepseek-chat", name: "DeepSeek Chat (V3)", provider: "deepseek" },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner (R1)",
    provider: "deepseek",
  },
] as const;
