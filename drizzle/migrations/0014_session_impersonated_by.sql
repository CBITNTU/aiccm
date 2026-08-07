-- Impersonation support for the Better Auth admin plugin.
--
-- 1. `session.impersonated_by` is the column the plugin writes when a superadmin
--    starts impersonating a user, and reads to stop.
-- 2. The plugin authorizes off Better Auth's own `user.role` column, while this
--    app keeps roles in `user_roles`. It only accepts roles declared in its
--    access-control config, so app superadmins map onto its built-in 'admin'.
--    Backfill existing superadmins; the role grant/revoke API keeps the two in
--    sync from here on.

ALTER TABLE "session"
  ADD COLUMN IF NOT EXISTS "impersonated_by" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_impersonated_by_user_id_fk'
  ) THEN
    ALTER TABLE "session"
      ADD CONSTRAINT "session_impersonated_by_user_id_fk"
      FOREIGN KEY ("impersonated_by") REFERENCES "user"("id") ON DELETE CASCADE;
  END IF;
END $$;

UPDATE "user"
SET "role" = 'admin'
WHERE "id" IN (
  SELECT "user_id" FROM "user_roles" WHERE "role" = 'superadmin'
)
AND ("role" IS DISTINCT FROM 'admin');
