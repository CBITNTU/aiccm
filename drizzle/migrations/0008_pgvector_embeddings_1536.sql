-- Enable pgvector and add embedding columns for basic/semantic matching (1536 dims).
-- OpenAI text-embedding-3-small and Ollama (padded) both target this width.
-- Run on a pgvector-enabled Postgres image (e.g. pgvector/pgvector:pg18).
-- After migrate: npm run embed:backfill

CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536),
  ADD COLUMN IF NOT EXISTS "embedding_generated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "embedding_source_hash" text;
--> statement-breakpoint

ALTER TABLE "tenders"
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536),
  ADD COLUMN IF NOT EXISTS "embedding_generated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "embedding_source_hash" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tenders_embedding_hnsw_idx"
  ON "tenders"
  USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "companies_embedding_hnsw_idx"
  ON "companies"
  USING hnsw ("embedding" vector_cosine_ops);
