-- Create function to update project status
CREATE OR REPLACE FUNCTION public.update_project_status(
  project_id UUID,
  new_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.virtual_organizations
  SET status = new_status,
      updated_at = now()
  WHERE id = project_id;
END;
$$;