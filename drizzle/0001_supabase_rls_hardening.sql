ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."vehicles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."rental_leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."lead_status_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  application_role text;
BEGIN
  FOREACH application_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = application_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.organizations, public.vehicles, public.rental_leads, public.lead_status_history FROM %I',
        application_role
      );
    END IF;
  END LOOP;
END
$$;
