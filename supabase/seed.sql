-- Seed script: run with `supabase db reset` or execute in SQL Editor.
-- Creates one loginable superadmin for local/dev.
-- Requires pgcrypto (Supabase has it; uncomment below if needed).
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_email TEXT := 'admin@example.com';
  v_password TEXT := 'AdminPassword1!';
  v_instance_id UUID := (SELECT id FROM auth.instances LIMIT 1);
BEGIN
  -- 1) Auth user (so they can log in)
  -- Token columns must be '' not NULL or Auth returns "Database error querying schema" on sign-in.
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    v_user_id,
    COALESCE(v_instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Admin","last_name":"User"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- 2) Identity (required for email sign-in)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    format('{"sub": "%s", "email": "%s"}', v_user_id, v_email)::jsonb,
    'email',
    v_user_id::text,
    now(),
    now(),
    now()
  );

  -- Trigger will have created profile (pending) and 'individual' role.
  -- 3) Approve profile and mark onboarding complete
  UPDATE public.profiles
  SET
    approval_status = 'approved',
    approved_at = now(),
    onboarding_step = 5,
    onboarding_completed_at = now()
  WHERE profiles.user_id = v_user_id;

  -- 4) Grant superadmin
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'superadmin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- Fix existing auth users created by earlier seed runs (token columns must be '' not NULL for sign-in)
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  recovery_token = COALESCE(recovery_token, '')
WHERE confirmation_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR recovery_token IS NULL;
