-- Extend events action_type for API trail coverage
ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS valid_action_type;

ALTER TABLE public.events
ADD CONSTRAINT valid_action_type CHECK (
  action_type IN (
    -- Authentication
    'user_login',
    'user_logout',
    'user_signup',
    'user_signup_invite',
    'user_email_verified',
    'email_verification_resent',
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
    'company_searched',
    'company_prefill_requested',
    -- Tender actions
    'tender_viewed',
    'tender_bookmarked',
    'tender_unbookmarked',
    'tender_applied',
    'tender_imported',
    'tender_ai_generated',
    'tender_analyzed',
    -- Matching actions
    'matching_started',
    'matching_triggered',
    'matching_completed',
    'matching_cancelled',
    'matching_result_viewed',
    -- Profile actions
    'profile_updated',
    'profile_viewed',
    'onboarding_verification_checked',
    'platform_stats_viewed',
    -- Project/VO actions
    'project_created',
    'project_updated',
    'project_deleted',
    'project_member_invited',
    'project_member_joined',
    'project_analyzed',
    'team_analyzed',
    -- Admin actions
    'admin_user_approved',
    'admin_user_rejected',
    'admin_company_approved',
    'admin_company_rejected',
    'admin_tender_imported',
    'admin_tender_ai_regenerated',
    'admin_taxonomy_updated',
    'admin_demo_sync_run',
    'admin_demo_sync_add_user',
    'admin_demo_sync_results',
    'admin_onboarding',
    'admin_edit_pending_company',
    -- Queue/Processing
    'queue_job_created',
    'queue_job_completed',
    'queue_job_failed',
    'queue_status_viewed',
    'queue_stats_viewed',
    'queue_job_status_viewed',
    'queue_debug_viewed',
    -- Other
    'chat_advisor_used',
    -- System events
    'system_error',
    'rate_limit_exceeded',
    'api_error'
  )
);
