/**
 * Optional second-stage rerank using the same Ollama embed model as Basic Match
 * (`qwen3-embedding` by default). Asymmetric query↔document cosine similarity —
 * not a chat model and not a separate "reranker" product.
 *
 * Enable: BASIC_MATCH_EMBED_RERANK=1 (off by default; adds ~12 embed calls per search).
 */

import { embedText, EMBEDDING_DIM } from "@/lib/ai/embeddings";

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

export function embedRerankEnabled(): boolean {
  return (
    process.env.BASIC_MATCH_EMBED_RERANK === "1" ||
    process.env.BASIC_MATCH_EMBED_RERANK === "true" ||
    // Legacy name — same feature
    process.env.BASIC_MATCH_LLM_RERANK === "1" ||
    process.env.BASIC_MATCH_LLM_RERANK === "true"
  );
}

/**
 * Score 0–1 relevance using query (company) vs document (tender) embeddings.
 */
export async function embedRerankScore(
  companyProfile: string,
  tenderText: string,
): Promise<number> {
  const [queryVec, docVec] = await Promise.all([
    embedText(companyProfile, "query"),
    embedText(tenderText, "tender"),
  ]);

  if (queryVec.dim !== EMBEDDING_DIM || docVec.dim !== EMBEDDING_DIM) {
    throw new Error("embed rerank dimension mismatch");
  }

  const sim = cosineSimilarity(queryVec.vector, docVec.vector);
  return Math.max(0, Math.min(1, sim));
}
