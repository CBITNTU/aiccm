/**
 * Local embedding generation via Ollama.
 *
 * Default: `qwen3-embedding:0.6b` (same Qwen family as MATCHING_MODEL benchmarks).
 * Chat models (qwen2.5:7b, etc.) are for structured LLM scoring only — not embeddings.
 *
 * Override via OLLAMA_EMBED_MODEL / OLLAMA_EMBED_DIM / OLLAMA_HOST.
 */

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

/**
 * Embed a single string. Throws on network / model error.
 */
export async function embedText(text: string): Promise<EmbedResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("embedText: input must be non-empty");
  }

  const host = ollamaHost();
  const res = await fetch(`${host}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: trimmed,
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
export async function embedBatch(texts: string[]): Promise<EmbedResult[]> {
  const out: EmbedResult[] = [];
  for (const t of texts) {
    out.push(await embedText(t));
  }
  return out;
}

/**
 * Format a number[] for pgvector's text input (`[1,2,3]`).
 */
export function vectorToLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
