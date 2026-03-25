CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending_verification', 'verified');--> statement-breakpoint
CREATE TABLE "company_verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submission_notes" text,
	"review_notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"company_snapshot" jsonb DEFAULT '{}'::jsonb,
	"payment_reference" text,
	"scheduled_visit_at" timestamp with time zone,
	"questionnaire_responses" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competency_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"proposed_additions" jsonb DEFAULT '[]'::jsonb,
	"proposed_removals" jsonb DEFAULT '[]'::jsonb,
	"review_notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "verification_status" "verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "company_verification_requests" ADD CONSTRAINT "company_verification_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_verification_requests" ADD CONSTRAINT "company_verification_requests_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_verification_requests" ADD CONSTRAINT "company_verification_requests_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_change_requests" ADD CONSTRAINT "competency_change_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_change_requests" ADD CONSTRAINT "competency_change_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competency_change_requests" ADD CONSTRAINT "competency_change_requests_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_verified_by_user_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;