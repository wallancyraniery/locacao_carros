ALTER TABLE "rental_leads" ADD COLUMN "usage_purpose" text;--> statement-breakpoint
ALTER TABLE "rental_leads" ADD COLUMN "has_ear" boolean;--> statement-breakpoint
ALTER TABLE "rental_leads" ADD CONSTRAINT "rental_leads_usage_purpose_check" CHECK ("rental_leads"."usage_purpose" is null or "rental_leads"."usage_purpose" in ('professional_app', 'other'));