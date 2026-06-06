import type { EmbedConfig } from "@/lib/ai/embedConfig";

export type EmbedTask = "company" | "tender" | "query";

export interface EmbedResult {
  vector: number[];
  model: string;
  dim: number;
  provider: string;
}

export interface EmbeddingProvider {
  readonly id: string;
  embed(text: string, config: EmbedConfig): Promise<EmbedResult>;
}
