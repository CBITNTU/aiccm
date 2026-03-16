CREATE TABLE "company_markets" (
	"company_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	CONSTRAINT "company_markets_company_id_market_id_pk" PRIMARY KEY("company_id","market_id")
);
--> statement-breakpoint
CREATE TABLE "company_standards" (
	"company_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL,
	CONSTRAINT "company_standards_company_id_standard_id_pk" PRIMARY KEY("company_id","standard_id")
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standards_ref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_capabilities_ref" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "company_markets" ADD CONSTRAINT "company_markets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_markets" ADD CONSTRAINT "company_markets_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_standards" ADD CONSTRAINT "company_standards_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_standards" ADD CONSTRAINT "company_standards_standard_id_standards_ref_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards_ref"("id") ON DELETE cascade ON UPDATE no action;