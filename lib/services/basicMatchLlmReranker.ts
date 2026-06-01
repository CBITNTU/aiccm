/**
 * Optional second-stage rerank via a small Ollama chat/reranker model.
 * Off by default (BASIC_MATCH_LLM_RERANK=1 to enable). Falls back silently on error.
 */

function ollamaHost(): string {
  const raw =
    process.env.OLLAMA_HOST?.trim() ||
    process.env.OLLAMA_BASE_URL?.trim() ||
    "http://127.0.0.1:11434";
  return raw.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

const RERANK_MODEL =
  process.env.OLLAMA_RERANK_MODEL?.trim() || "qwen2.5:3b";

export function llmRerankEnabled(): boolean {
  return (
    process.env.BASIC_MATCH_LLM_RERANK === "1" ||
    process.env.BASIC_MATCH_LLM_RERANK === "true"
  );
}

/**
 * Score 0–1 relevance of a tender snippet to a company profile query.
 */
export async function scoreRelevance(
  companyQuery: string,
  tenderSnippet: string,
): Promise<number | null> {
  const host = ollamaHost();
  const prompt = `You grade procurement fit. Reply with ONLY a number from 0 to 100 (no words).

Company profile:
${companyQuery.slice(0, 1200)}

Tender:
${tenderSnippet.slice(0, 1200)}

Relevance score (0-100):`;

  try {
    const res = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: RERANK_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0 },
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { response?: string };
    const raw = data.response?.trim() ?? "";
    const num = Number.parseFloat(raw.split(/\s+/)[0] ?? "");
    if (Number.isNaN(num)) return null;
    return Math.max(0, Math.min(1, num / 100));
  } catch {
    return null;
  }
}
