/** pgvector column width — must match Drizzle schema and migrations. */
export const STORAGE_EMBEDDING_DIM = 1536;

/** Native output for local Ollama qwen3-embedding:0.6b (MRL). Padded to STORAGE on write. */
export const OLLAMA_NATIVE_EMBED_DIM = 1024;
