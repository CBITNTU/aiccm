-- Step 1: Add new enum values to app_role
-- This must be in a separate migration so the values are available for the next migration
DO $$ 
BEGIN
  -- Add 'superadmin' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'superadmin' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'superadmin';
  END IF;

  -- Add 'sme-owner' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'sme-owner' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'sme-owner';
  END IF;
END $$;

