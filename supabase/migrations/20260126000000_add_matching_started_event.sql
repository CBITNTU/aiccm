-- Add 'matching_started' to allowed event action types
ALTER TABLE public.events 
DROP CONSTRAINT IF EXISTS valid_action_type;

ALTER TABLE public.events
ADD CONSTRAINT valid_action_type CHECK (
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
    'matching_started',    -- NEW: When user initiates matching
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
);
