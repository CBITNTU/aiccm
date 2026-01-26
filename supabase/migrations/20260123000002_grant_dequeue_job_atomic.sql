-- Grant execute permission for dequeue_job_atomic function
GRANT EXECUTE ON FUNCTION public.dequeue_job_atomic() TO postgres, anon, authenticated, service_role
