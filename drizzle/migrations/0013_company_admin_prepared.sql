-- Admin preparation marker. Set when a superadmin curates a company on the
-- owner's behalf from /admin/approvals before approving them. Approval reads
-- this to skip the automatic AI prefill, which would otherwise overwrite the
-- curated description, address, capabilities, certifications and equipment.

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "admin_prepared_at" timestamp with time zone;

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "admin_prepared_by" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_admin_prepared_by_user_id_fk'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_admin_prepared_by_user_id_fk"
      FOREIGN KEY ("admin_prepared_by") REFERENCES "user"("id") ON DELETE SET NULL;
  END IF;
END $$;
