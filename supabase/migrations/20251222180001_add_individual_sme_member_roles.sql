-- Add new role enum values for the approval workflow feature
-- This must be in a separate migration so the values are available for subsequent migrations

DO $$
BEGIN
  -- Add 'individual' role if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'individual'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'individual';
  END IF;

  -- Add 'sme-member' role if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'sme-member'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'sme-member';
  END IF;
END $$;
