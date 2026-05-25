import { createOpenAI } from "@ai-sdk/openai";

/** Prefix for model IDs routed to a local Ollama instance (OpenAI-compatible API). */
export const OLLAMA_MODEL_PREFIX = "ollama/";

let ollamaProvider: ReturnType<typeof createOpenAI> | null = null;

export function isOllamaModelId(modelId: string): boolean {
  return modelId.startsWith(OLLAMA_MODEL_PREFIX);
}

export function toOllamaModelName(modelId: string): string {
  return modelId.slice(OLLAMA_MODEL_PREFIX.length);
}

/**
 * OpenAI-compatible client for Ollama (`ollama serve`, default :11434).
 * Set OLLAMA_BASE_URL if not using the default (e.g. remote VM).
 */
export function getOllamaProvider() {
  if (!ollamaProvider) {
    const raw =
      process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434/v1";
    const baseURL = raw.endsWith("/v1") ? raw : `${raw.replace(/\/$/, "")}/v1`;
    ollamaProvider = createOpenAI({
      baseURL,
      apiKey: process.env.OLLAMA_API_KEY?.trim() || "ollama",
    });
  }
  return ollamaProvider;
}

/** Model id for tender matching when MATCHING_MODEL is set (local dev). */
export function getMatchingModelFromEnv(): string | undefined {
  const id = process.env.MATCHING_MODEL?.trim();
  return id || undefined;
}
