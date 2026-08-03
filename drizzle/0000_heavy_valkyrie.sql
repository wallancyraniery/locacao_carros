CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'under_review', 'approved', 'rejected', 'converted');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('available', 'reserved', 'rented', 'maintenance', 'inactive');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"version" text,
	"year" integer NOT NULL,
	"color" text NOT NULL,
	"weekly_price_cents" integer NOT NULL,
	"status" "vehicle_status" NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_weekly_price_cents_non_negative_check" CHECK ("vehicles"."weekly_price_cents" >= 0),
	CONSTRAINT "vehicles_year_reasonable_check" CHECK ("vehicles"."year" between 1900 and 2200)
);
--> statement-breakpoint
CREATE TABLE "rental_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"city" text NOT NULL,
	"has_definitive_license" boolean NOT NULL,
	"driver_platform" text,
	"preferred_contact_time" text,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"rental_lead_id" uuid NOT NULL,
	"from_status" "lead_status",
	"to_status" "lead_status" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_leads" ADD CONSTRAINT "rental_leads_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_leads" ADD CONSTRAINT "rental_leads_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_rental_lead_id_fk" FOREIGN KEY ("rental_lead_id") REFERENCES "public"."rental_leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "vehicles_organization_id_idx" ON "vehicles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "vehicles_organization_status_idx" ON "vehicles" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "rental_leads_organization_id_idx" ON "rental_leads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rental_leads_organization_status_idx" ON "rental_leads" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "rental_leads_organization_created_at_idx" ON "rental_leads" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_status_history_rental_lead_created_at_idx" ON "lead_status_history" USING btree ("rental_lead_id","created_at");