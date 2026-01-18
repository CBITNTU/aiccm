-- Add batch_id column to processing_queue to link jobs to batches
ALTER TABLE public.processing_queue 
ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batch_jobs(id) ON DELETE SET NULL;

-- Create index for faster batch lookups
CREATE INDEX IF NOT EXISTS idx_processing_queue_batch_id ON public.processing_queue(batch_id) WHERE batch_id IS NOT NULL;
