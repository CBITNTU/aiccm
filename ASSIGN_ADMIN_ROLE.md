# How to Assign Admin Role

## Current Situation

When a user signs up:
- ✅ A profile is created automatically (via `handle_new_user()` trigger)
- ❌ **NO role is assigned** - the `user_roles` table stays empty

This means:
- New users have no role by default
- You need to manually assign roles
- The admin panel won't be accessible until you have an admin role

## How to Make Yourself Admin

### Option 1: Using Supabase Studio (Easiest)

1. **Open Supabase Studio**: http://127.0.0.1:54323
2. **Go to SQL Editor**
3. **Find your user ID**:
   ```sql
   SELECT id, email, created_at 
   FROM auth.users 
   ORDER BY created_at DESC;
   ```
4. **Assign admin role** (replace `YOUR_USER_ID` with your actual user ID):
   ```sql
   INSERT INTO public.user_roles (user_id, role) 
   VALUES ('YOUR_USER_ID', 'admin'::app_role)
   ON CONFLICT (user_id, role) DO NOTHING;
   ```

### Option 2: Using SQL by Email

If you know your email address:
```sql
INSERT INTO public.user_roles (user_id, role) 
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'your-email@example.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

### Option 3: Using pgAdmin or psql

Connect to the database and run the SQL from Option 1 or 2.

## Verify It Worked

Check your role:
```sql
SELECT ur.*, u.email 
FROM public.user_roles ur
JOIN auth.users u ON ur.user_id = u.id
WHERE u.email = 'your-email@example.com';
```

You should see a row with `role = 'admin'`.

## Fix: Auto-Assign 'user' Role on Signup

To automatically assign the 'user' role to new signups, update the `handle_new_user()` function:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, email, first_name, last_name, job_title)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'job_title'
  );
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;
```

This will ensure all new users get the 'user' role automatically, and you can then promote specific users to 'admin' as needed.

