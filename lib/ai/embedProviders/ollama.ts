import type { EmbedConfig } from "@/lib/ai/embedConfig";
import type { EmbeddingProvider, EmbedResult } from "./types";

interface OllamaEmbedResponse {
  embedding?: number[];
  embeddings?: number[][];
  error?: string;
}

export const ollamaEmbeddingProvider: EmbeddingProvider = {
  id: "ollama",

  async embed(text: string, config: EmbedConfig): Promise<EmbedResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const res = await fetch(`${config.baseUrl}/api/embed`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        input: text,
        dimensions: config.dim,
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

    if (vector.length !== config.dim) {
      throw new Error(
        `Ollama embed dimension mismatch: expected ${config.dim}, got ${vector.length} (model ${config.model})`,
      );
    }

    return {
      vector,
      model: config.model,
      dim: vector.length,
      provider: "ollama",
    };
  },
};
