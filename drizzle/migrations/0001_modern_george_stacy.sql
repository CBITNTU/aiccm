CREATE TABLE "demo_matching_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_label" text NOT NULL,
	"company_id" uuid NOT NULL,
	"tender_id" uuid NOT NULL,
	"model_used" text NOT NULL,
	"overall_score" integer,
	"capability_score" integer,
	"experience_score" integer,
	"location_score" integer,
	"certification_score" integer,
	"match_reasons" text[],
	"improvement_suggestions" text[],
	"ai_analysis" jsonb
);
--> statement-breakpoint
ALTER TABLE "demo_matching_results" ADD CONSTRAINT "demo_matching_results_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_matching_results" ADD CONSTRAINT "demo_matching_results_tender_id_tenders_id_fk" FOREIGN KEY ("tender_id") REFERENCES "public"."tenders"("id") ON DELETE cascade ON UPDATE no action;