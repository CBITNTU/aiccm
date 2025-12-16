-- Add admin policies for taxonomy management
-- Admins can create, update, and delete taxonomies

-- Drop existing admin policies if they exist
DROP POLICY IF EXISTS "Admins can insert taxonomies" ON public.taxonomies;
DROP POLICY IF EXISTS "Admins can update taxonomies" ON public.taxonomies;
DROP POLICY IF EXISTS "Admins can delete taxonomies" ON public.taxonomies;
DROP POLICY IF EXISTS "Admins can manage taxonomies" ON public.taxonomies;

-- Create separate policies for INSERT, UPDATE, DELETE
-- This is more explicit and avoids conflicts with the SELECT policy

DO $$ 
BEGIN
  -- INSERT policy for admins
  CREATE POLICY "Admins can insert taxonomies"
  ON public.taxonomies
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

  -- UPDATE policy for admins
  CREATE POLICY "Admins can update taxonomies"
  ON public.taxonomies
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

  -- DELETE policy for admins
  CREATE POLICY "Admins can delete taxonomies"
  ON public.taxonomies
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

