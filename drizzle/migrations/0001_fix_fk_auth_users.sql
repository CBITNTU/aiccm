-- Drop old Supabase FK constraints that reference auth.users
-- These are superseded by drizzle-generated FKs to public.user
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
            AND tc.constraint_schema = rc.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
            ON rc.unique_constraint_name = ccu.constraint_name
            AND rc.unique_constraint_schema = ccu.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_schema = 'auth'
            AND ccu.table_name = 'users'
            AND tc.table_schema = 'public'
    )
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
        RAISE NOTICE 'Dropped constraint % on table %', r.constraint_name, r.table_name;
    END LOOP;
END $$;
