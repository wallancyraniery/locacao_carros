DO $$ BEGIN
  IF current_user IN ('anon','authenticated','lead_intake_runtime') OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)
  ) THEN RAISE EXCEPTION 'trusted_migration_owner_required'; END IF;
END $$;
--> statement-breakpoint
CREATE SCHEMA tenant_lead_intake_private;
REVOKE ALL ON SCHEMA tenant_lead_intake_private FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
CREATE FUNCTION tenant_lead_intake_private.eligible(p_organization_id uuid, p_vehicle_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.organizations o JOIN public.vehicles v ON v.organization_id=o.id
    WHERE o.id=p_organization_id AND v.id=p_vehicle_id AND o.storefront_status='published'
      AND NOT v.is_demo AND v.operational_status='active' AND v.status='available');
$$;
REVOKE ALL ON FUNCTION tenant_lead_intake_private.eligible(uuid,uuid) FROM PUBLIC, anon, authenticated, lead_intake_runtime;
GRANT USAGE ON SCHEMA tenant_lead_intake_private TO lead_intake_runtime;
GRANT EXECUTE ON FUNCTION tenant_lead_intake_private.eligible(uuid,uuid) TO lead_intake_runtime;
--> statement-breakpoint
CREATE FUNCTION tenant_lead_intake_private.resolve(p_slug text, p_vehicle_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('organization_id',o.id,'vehicle_id',v.id)
  FROM public.organizations o JOIN public.vehicles v ON v.organization_id=o.id
  WHERE p_slug IS NOT NULL AND length(p_slug) BETWEEN 3 AND 63 AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND p_vehicle_id IS NOT NULL AND o.slug=p_slug AND o.storefront_status='published'
    AND NOT v.is_demo AND v.operational_status='active' AND v.status='available' AND v.id=p_vehicle_id;
$$;
REVOKE ALL ON FUNCTION tenant_lead_intake_private.resolve(text,uuid) FROM PUBLIC, anon, authenticated, lead_intake_runtime;
GRANT EXECUTE ON FUNCTION tenant_lead_intake_private.resolve(text,uuid) TO lead_intake_runtime;
--> statement-breakpoint
CREATE FUNCTION public.resolve_tenant_lead_intake(p_slug text,p_vehicle_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT tenant_lead_intake_private.resolve(p_slug,p_vehicle_id); $$;
REVOKE ALL ON FUNCTION public.resolve_tenant_lead_intake(text,uuid) FROM PUBLIC, anon, authenticated, lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_lead_intake(text,uuid) TO lead_intake_runtime;
--> statement-breakpoint
DROP POLICY "lead_intake_runtime_guard_new_demo_lead_insert" ON public.rental_leads;
CREATE POLICY "lead_intake_runtime_guard_new_or_storefront_lead_insert" ON public.rental_leads AS RESTRICTIVE FOR INSERT TO lead_intake_runtime WITH CHECK (
  status='new' AND vehicle_id IS NOT NULL AND (
    (organization_id='10000000-0000-4000-8000-000000000001'::uuid AND EXISTS(SELECT 1 FROM public.vehicles WHERE id=rental_leads.vehicle_id AND organization_id=rental_leads.organization_id AND is_demo AND status='available'))
    OR tenant_lead_intake_private.eligible(organization_id,vehicle_id)
  )
);
