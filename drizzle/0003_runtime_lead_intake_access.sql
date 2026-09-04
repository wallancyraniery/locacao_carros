DO $$
DECLARE
  runtime_role_oid oid;
BEGIN
  SELECT oid INTO runtime_role_oid FROM pg_roles WHERE rolname = 'lead_intake_runtime';

  IF runtime_role_oid IS NULL THEN
    CREATE ROLE lead_intake_runtime
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    IF EXISTS (
      WITH RECURSIVE
      parent_roles(roleid) AS (
        SELECT roleid FROM pg_auth_members WHERE member = runtime_role_oid
        UNION
        SELECT membership.roleid FROM pg_auth_members AS membership
        INNER JOIN parent_roles ON membership.member = parent_roles.roleid
      ),
      member_roles(member) AS (
        SELECT member FROM pg_auth_members WHERE roleid = runtime_role_oid
        UNION
        SELECT membership.member FROM pg_auth_members AS membership
        INNER JOIN member_roles ON membership.roleid = member_roles.member
      )
      SELECT 1 FROM parent_roles
      UNION ALL
      SELECT 1 FROM member_roles
    ) THEN
      RAISE EXCEPTION 'Migration recusada: lead_intake_runtime possui memberships inesperados; investigue o estado antes de prosseguir.';
    END IF;

    ALTER ROLE lead_intake_runtime
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_namespace
    CROSS JOIN LATERAL aclexplode(COALESCE(nspacl, acldefault('n', nspowner))) AS privilege
    WHERE nspname = 'public'
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'CREATE'
  ) THEN
    RAISE EXCEPTION 'Migration recusada: PUBLIC possui CREATE no schema public; revise o ambiente antes de prosseguir.';
  END IF;
END
$$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.organizations, public.vehicles, public.rental_leads, public.lead_status_history FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE public.organizations, public.vehicles, public.rental_leads, public.lead_status_history FROM lead_intake_runtime;
--> statement-breakpoint
DO $$
DECLARE
  project_sequence regclass;
BEGIN
  FOR project_sequence IN
    SELECT sequence_class.oid::regclass
    FROM pg_class AS sequence_class
    INNER JOIN pg_depend AS dependency
      ON dependency.objid = sequence_class.oid
      AND dependency.deptype IN ('a', 'i')
    INNER JOIN pg_class AS table_class ON table_class.oid = dependency.refobjid
    INNER JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
    WHERE sequence_class.relkind = 'S'
      AND table_namespace.nspname = 'public'
      AND table_class.relname IN ('organizations', 'vehicles', 'rental_leads', 'lead_status_history')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC', project_sequence);
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM lead_intake_runtime', project_sequence);
  END LOOP;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO lead_intake_runtime;
--> statement-breakpoint
GRANT SELECT (id) ON TABLE public.organizations TO lead_intake_runtime;
--> statement-breakpoint
GRANT SELECT (id, organization_id, status, is_demo) ON TABLE public.vehicles TO lead_intake_runtime;
--> statement-breakpoint
GRANT INSERT (
  id, organization_id, vehicle_id, full_name, phone, email, city,
  has_definitive_license, usage_purpose, has_ear, driver_platform,
  preferred_contact_time, status
) ON TABLE public.rental_leads TO lead_intake_runtime;
--> statement-breakpoint
CREATE POLICY "lead_intake_runtime_enable_demo_organization_select"
  ON public.organizations AS PERMISSIVE FOR SELECT TO lead_intake_runtime
  USING (true);
--> statement-breakpoint
CREATE POLICY "lead_intake_runtime_guard_demo_organization_select"
  ON public.organizations AS RESTRICTIVE FOR SELECT TO lead_intake_runtime
  USING (id = '10000000-0000-4000-8000-000000000001'::uuid);
--> statement-breakpoint
CREATE POLICY "lead_intake_runtime_enable_available_demo_vehicle_select"
  ON public.vehicles AS PERMISSIVE FOR SELECT TO lead_intake_runtime
  USING (true);
--> statement-breakpoint
CREATE POLICY "lead_intake_runtime_guard_available_demo_vehicle_select"
  ON public.vehicles AS RESTRICTIVE FOR SELECT TO lead_intake_runtime
  USING (
    organization_id = '10000000-0000-4000-8000-000000000001'::uuid
    AND is_demo = true
    AND status = 'available'
  );
--> statement-breakpoint
CREATE POLICY "lead_intake_runtime_enable_new_demo_lead_insert"
  ON public.rental_leads AS PERMISSIVE FOR INSERT TO lead_intake_runtime
  WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "lead_intake_runtime_guard_new_demo_lead_insert"
  ON public.rental_leads AS RESTRICTIVE FOR INSERT TO lead_intake_runtime
  WITH CHECK (
    organization_id = '10000000-0000-4000-8000-000000000001'::uuid
    AND status = 'new'
    AND vehicle_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.vehicles
      WHERE vehicles.id = rental_leads.vehicle_id
        AND vehicles.organization_id = rental_leads.organization_id
        AND vehicles.is_demo = true
        AND vehicles.status = 'available'
    )
  );
