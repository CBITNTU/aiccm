ALTER TABLE "companies" ADD COLUMN "pending_changes" jsonb;--> statement-breakpoint
ALTER TABLE "company_verification_requests" ADD COLUMN "request_type" text DEFAULT 'initial_verification' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_verification_requests" ADD COLUMN "pending_changes_snapshot" jsonb;