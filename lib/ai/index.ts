export { resolveModel, getProviderName, SUPPORTED_MODELS } from "./models";
export {
  getMatchingModelFromEnv,
  isOllamaModelId,
  OLLAMA_MODEL_PREFIX,
  probeInferenceHost,
} from "./ollama";
export {
  getEmbedConfig,
  getInferenceBaseUrl,
  getOllamaHost,
  summarizeEmbedConfig,
  type EmbedConfig,
  type EmbedProviderId,
} from "./embedConfig";
export {
  embedText,
  embedBatch,
  EMBEDDING_DIM,
  formatEmbedInput,
  getEmbeddingConfigSummary,
  probeEmbeddingProvider,
  vectorToLiteral,
  type EmbedResult,
  type EmbedTask,
} from "./embeddings";
export { getPlatformModel } from "./provider";
export { aiGenerateObject, aiGenerateText } from "./generate";
