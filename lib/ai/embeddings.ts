/**
 * Embedding generation — provider-agnostic entry point.
 *
 * Configure via EMBED_PROVIDER / EMBED_MODEL / EMBED_DIM / EMBED_BASE_URL.
 * Legacy OLLAMA_EMBED_* vars remain supported (see docs/deployment-profiles.md).
 */

import {
  getEmbedConfig,
  summarizeEmbedConfig,
  type EmbedProviderId,
} from "@/lib/ai/embedConfig";
import {
  embedWithProvider,
  type EmbedResult,
  type EmbedTask,
} from "@/lib/ai/embedProviders";

export type { EmbedTask, EmbedResult, EmbedProviderId };

const EMBED_INSTRUCTIONS: Record<EmbedTask, string> = {
  company:
    "Represent this organisation profile for public procurement tender matching.",
  tender:
    "Represent this procurement opportunity for supplier organisation matching.",
  query: "Retrieve tenders relevant to this search query:",
};

/** Stored pgvector width — must match Drizzle schema `vector(N)`. */
export const EMBEDDING_DIM = Number(
  process.env.EMBED_DIM?.trim() ||
    process.env.OLLAMA_EMBED_DIM?.trim() ||
    "768",
);

export function formatEmbedInput(
  body: string,
  task: EmbedTask = "query",
  useInstructions = true,
): string {
  const trimmed = body.trim();
  if (!useInstructions || !trimmed) return trimmed;
  return `${EMBED_INSTRUCTIONS[task]}\n\n${trimmed}`;
}

export function getEmbeddingConfigSummary() {
  return summarizeEmbedConfig(getEmbedConfig());
}

/**
 * Embed a single string. Throws on network / model error.
 */
export async function embedText(
  text: string,
  task: EmbedTask = "query",
): Promise<EmbedResult> {
  const config = getEmbedConfig();
  const payload = formatEmbedInput(text, task, config.useInstructions);
  if (!payload) {
    throw new Error("embedText: input must be non-empty");
  }

  if (config.provider === "openai" && !config.apiKey) {
    throw new Error(
      "OpenAI embed provider requires OPENAI_API_KEY or EMBED_API_KEY",
    );
  }

  if (config.dim !== EMBEDDING_DIM) {
    throw new Error(
      `EMBED_DIM (${config.dim}) does not match schema EMBEDDING_DIM (${EMBEDDING_DIM}). ` +
        "Update lib/db/schema/app.ts and run a migration before changing dimensions.",
    );
  }

  return embedWithProvider(payload, config);
}

/**
 * Embed a batch sequentially (most providers accept one input per request).
 */
export async function embedBatch(
  texts: string[],
  task: EmbedTask = "query",
): Promise<EmbedResult[]> {
  const out: EmbedResult[] = [];
  for (const t of texts) {
    out.push(await embedText(t, task));
  }
  return out;
}

/**
 * Format a number[] for pgvector's text input (`[1,2,3]`).
 */
export function vectorToLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Lightweight connectivity probe for admin diagnostics.
 */
export async function probeEmbeddingProvider(): Promise<{
  ok: boolean;
  latencyMs: number;
  config: ReturnType<typeof summarizeEmbedConfig>;
  error?: string;
}> {
  const config = getEmbedConfig();
  const summary = summarizeEmbedConfig(config);
  const started = Date.now();
  try {
    await embedWithProvider("health check probe", config);
    return { ok: true, latencyMs: Date.now() - started, config: summary };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      config: summary,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
