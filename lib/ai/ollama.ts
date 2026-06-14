import { createOpenAI } from "@ai-sdk/openai";

import { getInferenceBaseUrl } from "@/lib/ai/embedConfig";

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
 * OpenAI-compatible client for Ollama / vLLM / LiteLLM / custom gateways.
 * Set INFERENCE_BASE_URL (or legacy OLLAMA_BASE_URL) for remote inference.
 */
export function getOllamaProvider() {
  if (!ollamaProvider) {
    ollamaProvider = createOpenAI({
      baseURL: getInferenceBaseUrl(),
      apiKey:
        process.env.INFERENCE_API_KEY?.trim() ||
        process.env.OLLAMA_API_KEY?.trim() ||
        "ollama",
    });
  }
  return ollamaProvider;
}

/** Model id for tender matching when MATCHING_MODEL is set (local dev). */
export function getMatchingModelFromEnv(): string | undefined {
  const id = process.env.MATCHING_MODEL?.trim();
  return id || undefined;
}

/**
 * Ping inference host (Ollama /tags or OpenAI-compatible models list).
 */
export async function probeInferenceHost(): Promise<{
  ok: boolean;
  latencyMs: number;
  baseUrl: string;
  error?: string;
}> {
  const baseUrl = getInferenceBaseUrl();
  const host = baseUrl.replace(/\/v1\/?$/, "");
  const apiKey =
    process.env.INFERENCE_API_KEY?.trim() ||
    process.env.EMBED_API_KEY?.trim() ||
    process.env.OLLAMA_API_KEY?.trim();
  const authHeaders: Record<string, string> = apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : {};
  const started = Date.now();

  // Ollama native
  try {
    const tagsRes = await fetch(`${host}/api/tags`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(8000),
    });
    if (tagsRes.ok) {
      return { ok: true, latencyMs: Date.now() - started, baseUrl };
    }
  } catch {
    // fall through to OpenAI-compatible probe
  }

  try {
    const modelsRes = await fetch(`${baseUrl}/models`, {
      headers: {
        ...authHeaders,
        Authorization: authHeaders.Authorization ?? "Bearer ollama",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (modelsRes.ok) {
      return { ok: true, latencyMs: Date.now() - started, baseUrl };
    }
    return {
      ok: false,
      latencyMs: Date.now() - started,
      baseUrl,
      error: `models endpoint returned ${modelsRes.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      baseUrl,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
