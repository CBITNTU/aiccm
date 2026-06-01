import { openai } from "@ai-sdk/openai";
import { deepseek } from "@ai-sdk/deepseek";
import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import {
  getOllamaProvider,
  isOllamaModelId,
  toOllamaModelName,
} from "./ollama";

/**
 * Resolve a model ID string to a Vercel AI SDK LanguageModel.
 * Routes to the correct provider based on model ID prefix.
 */
export function resolveModel(modelId: string): LanguageModel {
  if (isOllamaModelId(modelId)) {
    return getOllamaProvider()(toOllamaModelName(modelId));
  }
  if (modelId.startsWith("deepseek-")) {
    return deepseek(modelId);
  }
  if (modelId.startsWith("gemini-")) {
    return google(modelId);
  }
  // Default: OpenAI
  return openai(modelId);
}

/**
 * Derive the provider name from a model ID.
 */
export function getProviderName(modelId: string): string {
  if (isOllamaModelId(modelId)) return "ollama";
  if (modelId.startsWith("deepseek-")) return "deepseek";
  if (modelId.startsWith("gemini-")) return "google";
  return "openai";
}

/** Models available for admin selection. */
export const SUPPORTED_MODELS = [
  { id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai" },
  { id: "gpt-5-nano", name: "GPT-5 Nano", provider: "openai" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
  { id: "deepseek-chat", name: "DeepSeek Chat (V3)", provider: "deepseek" },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner (R1)",
    provider: "deepseek",
  },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
  {
    id: "ollama/qwen2.5:7b",
    name: "Qwen 2.5 7B (Ollama)",
    provider: "ollama",
  },
  {
    id: "ollama/qwen2.5:14b",
    name: "Qwen 2.5 14B (Ollama)",
    provider: "ollama",
  },
  {
    id: "ollama/qwen3:8b",
    name: "Qwen 3 8B (Ollama)",
    provider: "ollama",
  },
  {
    id: "ollama/qwen3:14b",
    name: "Qwen 3 14B (Ollama)",
    provider: "ollama",
  },
  {
    id: "ollama/qwen3:30b",
    name: "Qwen 3 30B MoE (Ollama)",
    provider: "ollama",
  },
] as const;
