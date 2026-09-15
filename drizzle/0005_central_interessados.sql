CREATE TABLE "organization_memberships" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_memberships_organization_id_idx" ON "organization_memberships" USING btree ("organization_id");
--> statement-breakpoint
-- Supabase provides these roles. Plain local PostgreSQL gets inert NOLOGIN equivalents.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.organization_memberships FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.rental_leads, public.vehicles FROM anon, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO authenticated;
--> statement-breakpoint
GRANT SELECT (user_id, organization_id) ON public.organization_memberships TO authenticated;
--> statement-breakpoint
GRANT SELECT (id, created_at, full_name, phone, email, city, vehicle_id, preferred_contact_time, status) ON public.rental_leads TO authenticated;
--> statement-breakpoint
GRANT SELECT (id, brand, model, version, year) ON public.vehicles TO authenticated;
--> statement-breakpoint
-- PostgREST sets request.jwt.claims only after validating the user's JWT.
-- The sub UUID is external to this schema; no user metadata participates in authorization.
CREATE POLICY central_membership_select ON public.organization_memberships
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY central_membership_guard ON public.organization_memberships
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (user_id = (SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
    AND coalesce((SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'is_anonymous')::boolean), false) = false);
--> statement-breakpoint
CREATE POLICY central_leads_select ON public.rental_leads
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY central_leads_guard ON public.rental_leads
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_memberships));
--> statement-breakpoint
CREATE POLICY central_vehicles_select ON public.vehicles
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY central_vehicles_guard ON public.vehicles
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_memberships));
