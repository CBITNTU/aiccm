import type { EmbedConfig, EmbedProviderId } from "@/lib/ai/embedConfig";
import { ollamaEmbeddingProvider } from "./ollama";
import { openaiCompatibleEmbeddingProvider } from "./openaiCompatible";
import type { EmbeddingProvider } from "./types";

const openaiEmbeddingProvider: EmbeddingProvider = {
  id: "openai",
  embed: (text, config) => openaiCompatibleEmbeddingProvider.embed(text, config),
};

const PROVIDERS: Record<EmbedProviderId, EmbeddingProvider> = {
  ollama: ollamaEmbeddingProvider,
  openai: openaiEmbeddingProvider,
  "openai-compatible": openaiCompatibleEmbeddingProvider,
};

export function resolveEmbeddingProvider(
  providerId: EmbedProviderId,
): EmbeddingProvider {
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Unknown embed provider: ${providerId}`);
  }
  return provider;
}

export async function embedWithProvider(
  text: string,
  config: EmbedConfig,
): Promise<ReturnType<EmbeddingProvider["embed"]>> {
  const provider = resolveEmbeddingProvider(config.provider);
  return provider.embed(text, config);
}

export type { EmbedResult, EmbedTask, EmbeddingProvider } from "./types";
