/**
 * Local embedding generation via Ollama.
 *
 * Default: `qwen3-embedding:0.6b` (Qwen family; use `qwen3-embedding:4b` for higher quality).
 * Chat models (qwen2.5:7b, etc.) are for structured LLM scoring only — not embeddings.
 *
 * Override via OLLAMA_EMBED_MODEL / OLLAMA_EMBED_DIM / OLLAMA_HOST.
 */

export type EmbedTask = "company" | "tender" | "query";

const EMBED_INSTRUCTIONS: Record<EmbedTask, string> = {
  company:
    "Represent this organisation profile for public procurement tender matching.",
  tender:
    "Represent this procurement opportunity for supplier organisation matching.",
  query: "Retrieve tenders relevant to this search query:",
};

function ollamaHost(): string {
  const raw =
    process.env.OLLAMA_HOST?.trim() ||
    process.env.OLLAMA_BASE_URL?.trim() ||
    "http://127.0.0.1:11434";
  return raw.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

const EMBED_MODEL =
  process.env.OLLAMA_EMBED_MODEL?.trim() || "qwen3-embedding:0.6b";

/** Stored pgvector width; Qwen3 supports MRL — request this many dims from Ollama. */
export const EMBEDDING_DIM = Number(process.env.OLLAMA_EMBED_DIM) || 768;

const USE_INSTRUCTIONS = process.env.OLLAMA_EMBED_INSTRUCTIONS !== "0";

interface OllamaEmbedResponse {
  embedding?: number[];
  embeddings?: number[][];
  error?: string;
}

export interface EmbedResult {
  vector: number[];
  model: string;
  dim: number;
}

export function formatEmbedInput(
  body: string,
  task: EmbedTask = "query",
): string {
  const trimmed = body.trim();
  if (!USE_INSTRUCTIONS || !trimmed) return trimmed;
  return `${EMBED_INSTRUCTIONS[task]}\n\n${trimmed}`;
}

/**
 * Embed a single string. Throws on network / model error.
 */
export async function embedText(
  text: string,
  task: EmbedTask = "query",
): Promise<EmbedResult> {
  const payload = formatEmbedInput(text, task);
  if (!payload) {
    throw new Error("embedText: input must be non-empty");
  }

  const host = ollamaHost();
  const res = await fetch(`${host}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: payload,
      dimensions: EMBEDDING_DIM,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Ollama embed failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as OllamaEmbedResponse;
  if (data.error) {
    throw new Error(`Ollama embed error: ${data.error}`);
  }

  const vector = data.embeddings?.[0] ?? data.embedding;
  if (!vector || vector.length === 0) {
    throw new Error("Ollama embed returned no vector");
  }

  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `Ollama embed dimension mismatch: expected ${EMBEDDING_DIM}, got ${vector.length} (model ${EMBED_MODEL})`,
    );
  }

  return { vector, model: EMBED_MODEL, dim: vector.length };
}

/**
 * Embed a batch sequentially (Ollama embed API is one input per request).
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
