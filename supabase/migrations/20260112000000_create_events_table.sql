-- Create events/audit_log table for tracking all user actions
CREATE TABLE IF NOT EXISTS public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- User information
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT, -- Denormalized for easier querying after user deletion
  
  -- Action details
  action_type TEXT NOT NULL,
  entity_type TEXT, -- e.g., 'company', 'tender', 'profile', 'matching_result'
  entity_id UUID, -- ID of the affected entity
  
  -- Additional context
  details JSONB DEFAULT '{}'::jsonb, -- Flexible JSON for action-specific data
  ip_address INET,
  user_agent TEXT,
  
  -- Request context (for API routes)
  request_path TEXT,
  request_method TEXT,
  
  -- Status
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'warning')),
  error_message TEXT, -- If status is 'error'
  
  -- Indexes for common queries
  CONSTRAINT valid_action_type CHECK (
    action_type IN (
      -- Authentication
      'user_login',
      'user_logout',
      'user_signup',
      'user_email_verified',
      'password_reset_requested',
      'password_reset_completed',
      
      -- Company actions
      'company_created',
      'company_updated',
      'company_deleted',
      'company_capabilities_updated',
      'company_member_invited',
      'company_member_approved',
      'company_member_removed',
      
      -- Tender actions
      'tender_viewed',
      'tender_bookmarked',
      'tender_unbookmarked',
      'tender_applied',
      'tender_imported',
      'tender_ai_generated',
      
      -- Matching actions
      'matching_triggered',
      'matching_completed',
      'matching_result_viewed',
      
      -- Profile actions
      'profile_updated',
      'profile_viewed',
      
      -- Project/VO actions
      'project_created',
      'project_updated',
      'project_deleted',
      'project_member_invited',
      'project_member_joined',
      
      -- Admin actions
      'admin_user_approved',
      'admin_user_rejected',
      'admin_company_approved',
      'admin_company_rejected',
      'admin_tender_imported',
      'admin_tender_ai_regenerated',
      'admin_taxonomy_updated',
      
      -- Queue/Processing
      'queue_job_created',
      'queue_job_completed',
      'queue_job_failed',
      
      -- System events
      'system_error',
      'rate_limit_exceeded',
      'api_error'
    )
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_user_id ON public.events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_action_type ON public.events(action_type);
CREATE INDEX IF NOT EXISTS idx_events_entity ON public.events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_events_user_action ON public.events(user_id, action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);

-- GIN index for JSONB details field (for flexible queries)
CREATE INDEX IF NOT EXISTS idx_events_details ON public.events USING GIN (details);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own events
CREATE POLICY "Users can view their own events"
  ON public.events
  FOR SELECT
  USING (auth.uid() = user_id);

-- Superadmins can view all events
CREATE POLICY "Superadmins can view all events"
  ON public.events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'superadmin'
    )
  );

-- System can insert events (via service role)
-- Note: This is handled by service role key, not RLS policy
-- But we allow authenticated users to log their own events
CREATE POLICY "Users can log their own events"
  ON public.events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

-- Only superadmins can delete events (for data retention)
CREATE POLICY "Only superadmins can delete events"
  ON public.events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'superadmin'
    )
  );

-- Comments
COMMENT ON TABLE public.events IS 'Audit log of all user actions and system events';
COMMENT ON COLUMN public.events.action_type IS 'Type of action performed';
COMMENT ON COLUMN public.events.entity_type IS 'Type of entity affected (e.g., company, tender)';
COMMENT ON COLUMN public.events.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN public.events.details IS 'Additional action-specific data in JSON format';
COMMENT ON COLUMN public.events.status IS 'Success, error, or warning status';
