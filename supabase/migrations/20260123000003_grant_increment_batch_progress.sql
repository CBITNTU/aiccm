-- Grant execute permission for increment_batch_progress function
GRANT EXECUTE ON FUNCTION public.increment_batch_progress(UUID, TEXT) TO postgres, anon, authenticated, service_role
