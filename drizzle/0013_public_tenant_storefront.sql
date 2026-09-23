-- Public projection and owner-controlled publication. No direct table writes or RLS changes.
DO $$
BEGIN
  IF current_user IN ('anon', 'authenticated', 'lead_intake_runtime') OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN RAISE EXCEPTION 'trusted_migration_owner_required'; END IF;
END;
$$;
--> statement-breakpoint
CREATE TYPE public.storefront_status AS ENUM ('draft', 'published');
ALTER TABLE public.organizations ADD COLUMN storefront_status public.storefront_status NOT NULL DEFAULT 'draft';
GRANT SELECT (storefront_status) ON public.organizations TO authenticated;
--> statement-breakpoint
CREATE SCHEMA storefront_private;
REVOKE ALL ON SCHEMA storefront_private FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
CREATE FUNCTION storefront_private.lookup(p_slug text, p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 63
    OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('slug', o.slug, 'name', o.name, 'city', o.city,
    'vehicles', coalesce((SELECT jsonb_agg(v.payload ORDER BY v.created_at, v.id) FROM (
      SELECT x.id, x.created_at, jsonb_build_object('brand', x.brand, 'model', x.model,
        'version', x.version, 'year', x.year, 'color', x.color, 'weekly_price_cents', x.weekly_price_cents) AS payload
      FROM public.vehicles x WHERE x.organization_id = o.id AND NOT x.is_demo
        AND x.operational_status = 'active' AND x.status = 'available'
      ORDER BY x.created_at, x.id LIMIT 24 OFFSET (p_page - 1) * 24
    ) v), '[]'::jsonb),
    'hasNext', EXISTS (SELECT 1 FROM public.vehicles x WHERE x.organization_id = o.id AND NOT x.is_demo
      AND x.operational_status = 'active' AND x.status = 'available'
      ORDER BY x.created_at, x.id LIMIT 1 OFFSET p_page * 24))
  INTO result FROM public.organizations o WHERE o.slug = p_slug AND o.storefront_status = 'published';
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION storefront_private.lookup(text,integer) FROM PUBLIC, anon, authenticated, lead_intake_runtime;
GRANT USAGE ON SCHEMA storefront_private TO anon;
GRANT EXECUTE ON FUNCTION storefront_private.lookup(text,integer) TO anon;
--> statement-breakpoint
CREATE FUNCTION public.lookup_tenant_storefront(p_slug text, p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT storefront_private.lookup(p_slug, p_page);
$$;
REVOKE ALL ON FUNCTION public.lookup_tenant_storefront(text,integer) FROM PUBLIC, anon, authenticated, lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.lookup_tenant_storefront(text,integer) TO anon;

--> statement-breakpoint
CREATE FUNCTION storefront_private.set_status(p_status text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  claims jsonb;
  actor uuid;
  tenant uuid;
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
  -- Hold authorization through commit, including concurrent membership revocation.
  SELECT organization_id INTO tenant FROM public.organization_memberships
    WHERE user_id = actor AND role = 'owner' FOR SHARE;
  IF tenant IS NULL THEN RAISE EXCEPTION 'owner_required' USING ERRCODE = '42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'invalid_storefront_status' USING ERRCODE = '22023';
  END IF;
  -- Setting a desired state is idempotent; this is not a toggle.
  UPDATE public.organizations SET storefront_status = p_status::public.storefront_status
    WHERE id = tenant AND storefront_status IS DISTINCT FROM p_status::public.storefront_status;
  RETURN p_status;
END;
$$;
REVOKE ALL ON FUNCTION storefront_private.set_status(text) FROM PUBLIC, anon, authenticated, lead_intake_runtime;
GRANT USAGE ON SCHEMA storefront_private TO authenticated;
GRANT EXECUTE ON FUNCTION storefront_private.set_status(text) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.set_tenant_storefront_status(p_status text)
RETURNS text LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT storefront_private.set_status(p_status);
$$;
REVOKE ALL ON FUNCTION public.set_tenant_storefront_status(text) FROM PUBLIC, anon, authenticated, lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.set_tenant_storefront_status(text) TO authenticated;
