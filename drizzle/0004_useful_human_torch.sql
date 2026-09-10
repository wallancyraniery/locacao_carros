ALTER TABLE "rental_leads" ADD COLUMN "operation_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "rental_leads" ALTER COLUMN "operation_id" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_leads_operation_id_unique" ON "rental_leads" USING btree ("operation_id");--> statement-breakpoint
GRANT INSERT (operation_id) ON TABLE public.rental_leads TO lead_intake_runtime;
