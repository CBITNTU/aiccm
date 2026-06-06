/**
 * Central embedding / inference configuration.
 *
 * Supports deployment profiles (local Ollama, remote Ollama, OpenAI, any
 * OpenAI-compatible gateway). Legacy OLLAMA_* env vars remain supported.
 */

export type EmbedProviderId = "ollama" | "openai" | "openai-compatible";

export interface EmbedConfig {
  provider: EmbedProviderId;
  model: string;
  dim: number;
  /** HTTP origin for embed calls (Ollama host or OpenAI-compatible /v1 base). */
  baseUrl: string;
  apiKey: string | undefined;
  useInstructions: boolean;
}

const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
const DEFAULT_EMBED_MODEL = "qwen3-embedding:0.6b";
const DEFAULT_EMBED_DIM = 768;

function trimEnv(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** Shared inference URL for chat + optional embed (OpenAI-compatible /v1). */
export function getInferenceBaseUrl(): string {
  const raw =
    trimEnv("INFERENCE_BASE_URL") ??
    trimEnv("OLLAMA_BASE_URL") ??
    `${DEFAULT_OLLAMA_HOST}/v1`;
  return raw.endsWith("/v1") ? raw : `${raw.replace(/\/$/, "")}/v1`;
}

/** Ollama native host (no /v1 suffix) for /api/embed. */
export function getOllamaHost(): string {
  const fromEmbed = trimEnv("EMBED_BASE_URL");
  const fromInference = trimEnv("INFERENCE_BASE_URL");
  const fromLegacy =
    trimEnv("OLLAMA_HOST") ?? trimEnv("OLLAMA_BASE_URL") ?? DEFAULT_OLLAMA_HOST;

  const raw = fromEmbed ?? fromInference ?? fromLegacy;
  return raw.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function hasRemoteInferenceUrl(): boolean {
  const urls = [
    trimEnv("EMBED_BASE_URL"),
    trimEnv("INFERENCE_BASE_URL"),
    trimEnv("OLLAMA_HOST"),
    trimEnv("OLLAMA_BASE_URL"),
  ].filter(Boolean) as string[];
  return urls.some((u) => {
    try {
      const { hostname } = new URL(u.includes("://") ? u : `http://${u}`);
      return (
        hostname !== "localhost" &&
        hostname !== "127.0.0.1" &&
        hostname !== "::1"
      );
    } catch {
      return false;
    }
  });
}

function resolveProvider(): EmbedProviderId {
  const explicit = trimEnv("EMBED_PROVIDER")?.toLowerCase();
  if (
    explicit === "ollama" ||
    explicit === "openai" ||
    explicit === "openai-compatible"
  ) {
    return explicit;
  }
  // Production: hosted inference service, or OpenAI embeddings fallback.
  // Local Ollama is dev-only unless explicitly configured with a remote URL.
  if (isProductionRuntime() && !hasRemoteInferenceUrl()) {
    if (trimEnv("OPENAI_API_KEY") || trimEnv("EMBED_API_KEY")) {
      return "openai";
    }
  }
  return "ollama";
}

function resolveApiKey(provider: EmbedProviderId): string | undefined {
  return (
    trimEnv("EMBED_API_KEY") ??
    trimEnv("INFERENCE_API_KEY") ??
    (provider === "openai" ? trimEnv("OPENAI_API_KEY") : undefined) ??
    trimEnv("OLLAMA_API_KEY")
  );
}

export function getEmbedConfig(): EmbedConfig {
  const provider = resolveProvider();
  const model =
    trimEnv("EMBED_MODEL") ??
    trimEnv("OLLAMA_EMBED_MODEL") ??
    DEFAULT_EMBED_MODEL;
  const dim =
    Number(trimEnv("EMBED_DIM") ?? trimEnv("OLLAMA_EMBED_DIM")) ||
    DEFAULT_EMBED_DIM;
  const useInstructions =
    trimEnv("EMBED_INSTRUCTIONS") !== "0" &&
    trimEnv("OLLAMA_EMBED_INSTRUCTIONS") !== "0";

  let baseUrl: string;
  if (provider === "ollama") {
    baseUrl = getOllamaHost();
  } else if (provider === "openai") {
    const raw =
      trimEnv("EMBED_BASE_URL") ??
      trimEnv("OPENAI_BASE_URL") ??
      "https://api.openai.com/v1";
    baseUrl = raw.endsWith("/v1") ? raw : `${raw.replace(/\/$/, "")}/v1`;
  } else {
    const raw =
      trimEnv("EMBED_BASE_URL") ?? trimEnv("INFERENCE_BASE_URL");
    if (!raw) {
      throw new Error(
        "openai-compatible embed provider requires EMBED_BASE_URL or INFERENCE_BASE_URL",
      );
    }
    baseUrl = raw.endsWith("/v1") ? raw : `${raw.replace(/\/$/, "")}/v1`;
  }

  return {
    provider,
    model,
    dim,
    baseUrl,
    apiKey: resolveApiKey(provider),
    useInstructions,
  };
}

/** Safe summary for logs / health checks (no secrets). */
export function summarizeEmbedConfig(config: EmbedConfig) {
  return {
    provider: config.provider,
    model: config.model,
    dim: config.dim,
    baseUrl: config.baseUrl,
    useInstructions: config.useInstructions,
    hasApiKey: Boolean(config.apiKey),
  };
}
