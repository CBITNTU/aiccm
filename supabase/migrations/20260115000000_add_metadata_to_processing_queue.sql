-- Add metadata column to processing_queue for storing job-specific options
ALTER TABLE public.processing_queue ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_processing_queue_metadata ON public.processing_queue USING GIN (metadata);
