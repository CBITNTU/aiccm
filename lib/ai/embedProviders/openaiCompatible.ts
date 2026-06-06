import type { EmbedConfig } from "@/lib/ai/embedConfig";
import type { EmbeddingProvider, EmbedResult } from "./types";

interface OpenAIEmbedResponse {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
}

/**
 * OpenAI `/v1/embeddings` and any compatible gateway (vLLM, LiteLLM, etc.).
 */
export const openaiCompatibleEmbeddingProvider: EmbeddingProvider = {
  id: "openai-compatible",

  async embed(text: string, config: EmbedConfig): Promise<EmbedResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const body: Record<string, unknown> = {
      model: config.model,
      input: text,
    };
    // OpenAI text-embedding-3-* supports Matryoshka dimensions
    if (config.dim > 0) {
      body.dimensions = config.dim;
    }

    const res = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Embeddings API failed (${res.status}): ${errBody.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as OpenAIEmbedResponse;
    if (data.error?.message) {
      throw new Error(`Embeddings API error: ${data.error.message}`);
    }

    const vector = data.data?.[0]?.embedding;
    if (!vector || vector.length === 0) {
      throw new Error("Embeddings API returned no vector");
    }

    if (vector.length !== config.dim) {
      throw new Error(
        `Embed dimension mismatch: expected ${config.dim}, got ${vector.length} (model ${config.model})`,
      );
    }

    return {
      vector,
      model: config.model,
      dim: vector.length,
      provider: "openai-compatible",
    };
  },
};
