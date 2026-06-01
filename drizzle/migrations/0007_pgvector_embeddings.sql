-- Enable pgvector and add embedding columns for basic/semantic matching.
-- Run on a pgvector-enabled Postgres image (e.g. pgvector/pgvector:pg18).

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "embedding" vector(768),
  ADD COLUMN IF NOT EXISTS "embedding_generated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "embedding_source_hash" text;
--> statement-breakpoint

ALTER TABLE "tenders"
  ADD COLUMN IF NOT EXISTS "embedding" vector(768),
  ADD COLUMN IF NOT EXISTS "embedding_generated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "embedding_source_hash" text;
--> statement-breakpoint

-- HNSW index for cosine-distance ANN. Cosine works well for normalised
-- sentence embeddings like nomic-embed-text. m / ef_construction defaults
-- (16 / 64) are appropriate for tens of thousands of rows; tune if needed.
CREATE INDEX IF NOT EXISTS "tenders_embedding_hnsw_idx"
  ON "tenders"
  USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "companies_embedding_hnsw_idx"
  ON "companies"
  USING hnsw ("embedding" vector_cosine_ops);
