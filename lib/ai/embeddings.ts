/**
 * Local embedding generation via Ollama.
 *
 * Default model: nomic-embed-text (768 dims, ~50 MB, very fast on CPU).
 * Override via OLLAMA_EMBED_MODEL env var.
 *
 * We deliberately bypass the AI SDK here because the embedding endpoints in
 * @ai-sdk/openai don't talk to Ollama cleanly and we want a single dependency
 * surface for this experiment.
 */

const OLLAMA_HOST =
  process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434";
const EMBED_MODEL =
  process.env.OLLAMA_EMBED_MODEL?.trim() || "nomic-embed-text";

export const EMBEDDING_DIM = 768;

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

  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: trimmed }),
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

  const vector = data.embedding ?? data.embeddings?.[0];
  if (!vector || vector.length === 0) {
    throw new Error("Ollama embed returned no vector");
  }

  return { vector, model: EMBED_MODEL, dim: vector.length };
}

/**
 * Embed a batch sequentially (Ollama doesn't support true batching over the
 * single-prompt embeddings endpoint, but sequential is still fast — ~20-50ms
 * per call on an M-series Mac).
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
