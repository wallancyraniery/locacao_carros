-- Fleet uses the existing vehicle schema. Read isolation remains the restrictive
-- membership RLS from 0005; no table write privileges are added.
GRANT SELECT (color, weekly_price_cents, operational_status, is_demo, created_at)
  ON public.vehicles TO authenticated;
--> statement-breakpoint
DO $$
BEGIN
  IF current_user IN ('anon', 'authenticated', 'lead_intake_runtime') OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN RAISE EXCEPTION 'trusted_migration_owner_required'; END IF;
END;
$$;
--> statement-breakpoint
CREATE SCHEMA fleet_private;
REVOKE ALL ON SCHEMA fleet_private FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
CREATE FUNCTION fleet_private.create_vehicle(
  p_operation_id uuid, p_brand text, p_model text, p_version text, p_year integer,
  p_color text, p_weekly_price_cents integer, p_operational_status text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  claims jsonb;
  actor uuid;
  tenant uuid;
  existing public.vehicles%ROWTYPE;
BEGIN
  BEGIN
    claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
    actor := (claims ->> 'sub')::uuid;
    IF actor IS NULL OR coalesce((claims ->> 'is_anonymous')::boolean, false) THEN
      RAISE EXCEPTION 'owner_required' USING ERRCODE = '42501';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE = '42501';
  END;
  -- Lock the association through commit: revocation/role changes serialize with creation.
  SELECT organization_id INTO tenant FROM public.organization_memberships
    WHERE user_id = actor AND role = 'owner' FOR SHARE;
  IF tenant IS NULL THEN RAISE EXCEPTION 'owner_required' USING ERRCODE = '42501'; END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'read_committed_required' USING ERRCODE = 'P3001';
  END IF;
  IF p_operation_id IS NULL
    OR p_brand IS NULL OR length(btrim(p_brand)) NOT BETWEEN 1 AND 80
    OR p_model IS NULL OR length(btrim(p_model)) NOT BETWEEN 1 AND 120
    OR length(btrim(p_version)) > 120
    OR p_color IS NULL OR length(btrim(p_color)) NOT BETWEEN 1 AND 60
    OR (p_brand || p_model || coalesce(p_version, '') || p_color) ~ '[[:cntrl:]]'
    OR p_year IS NULL OR p_year NOT BETWEEN 1900 AND 2200
    OR p_weekly_price_cents IS NULL OR p_weekly_price_cents < 0
    OR p_operational_status IS NULL OR p_operational_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'invalid_vehicle' USING ERRCODE = 'P3001';
  END IF;
  -- A server-generated operation UUID is the vehicle ID. Unique PK + post-conflict
  -- comparison makes sequential/concurrent retries safe without limiting fleet size.
  INSERT INTO public.vehicles (id, organization_id, brand, model, version, year, color,
    weekly_price_cents, status, operational_status, is_demo)
  VALUES (p_operation_id, tenant, btrim(p_brand), btrim(p_model), nullif(btrim(p_version), ''), p_year,
    btrim(p_color), p_weekly_price_cents,
    CASE WHEN p_operational_status = 'active' THEN 'available'::public.vehicle_status ELSE 'inactive'::public.vehicle_status END,
    p_operational_status::public.vehicle_operational_status, false)
  ON CONFLICT (id) DO NOTHING;
  SELECT * INTO existing FROM public.vehicles WHERE id = p_operation_id AND organization_id = tenant AND NOT is_demo;
  IF NOT FOUND OR ROW(existing.brand, existing.model, existing.version, existing.year, existing.color,
    existing.weekly_price_cents, existing.operational_status::text)
    IS DISTINCT FROM ROW(btrim(p_brand), btrim(p_model), nullif(btrim(p_version), ''), p_year, btrim(p_color),
      p_weekly_price_cents, p_operational_status) THEN
    RAISE EXCEPTION 'vehicle_operation_conflict' USING ERRCODE = 'P3003';
  END IF;
  RETURN existing.id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION fleet_private.create_vehicle(uuid,text,text,text,integer,text,integer,text)
  FROM PUBLIC, anon, authenticated, lead_intake_runtime;
GRANT USAGE ON SCHEMA fleet_private TO authenticated;
GRANT EXECUTE ON FUNCTION fleet_private.create_vehicle(uuid,text,text,text,integer,text,integer,text) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.create_fleet_vehicle(
  p_operation_id uuid, p_brand text, p_model text, p_version text, p_year integer,
  p_color text, p_weekly_price_cents integer, p_operational_status text
) RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT fleet_private.create_vehicle(p_operation_id, p_brand, p_model, p_version, p_year,
    p_color, p_weekly_price_cents, p_operational_status);
$$;
REVOKE ALL ON FUNCTION public.create_fleet_vehicle(uuid,text,text,text,integer,text,integer,text)
  FROM PUBLIC, anon, authenticated, lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.create_fleet_vehicle(uuid,text,text,text,integer,text,integer,text) TO authenticated;
