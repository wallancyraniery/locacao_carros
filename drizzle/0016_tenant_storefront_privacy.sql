DO $$ BEGIN
  IF current_user IN ('anon','authenticated','lead_intake_runtime') OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)
  ) THEN RAISE EXCEPTION 'trusted_migration_owner_required'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION storefront_private.lookup_interest_privacy(p_slug text,p_vehicle_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object(
    'data_controller', o.data_controller,
    'privacy_channel_label', o.privacy_channel_label,
    'privacy_channel_url', o.privacy_channel_url
  )
  FROM public.organizations o
  JOIN public.vehicles v ON v.organization_id=o.id
  WHERE p_slug IS NOT NULL AND length(p_slug) BETWEEN 3 AND 63
    AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND p_vehicle_id IS NOT NULL
    AND o.slug=p_slug AND o.storefront_status='published'
    AND v.id=p_vehicle_id AND NOT v.is_demo
    AND v.operational_status='active' AND v.status='available';
$$;
REVOKE ALL ON FUNCTION storefront_private.lookup_interest_privacy(text,uuid) FROM PUBLIC,anon,authenticated,lead_intake_runtime;
GRANT USAGE ON SCHEMA storefront_private TO anon;
GRANT EXECUTE ON FUNCTION storefront_private.lookup_interest_privacy(text,uuid) TO anon;
--> statement-breakpoint
CREATE FUNCTION public.lookup_tenant_storefront_interest_privacy(p_slug text,p_vehicle_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT storefront_private.lookup_interest_privacy(p_slug,p_vehicle_id);
$$;
REVOKE ALL ON FUNCTION public.lookup_tenant_storefront_interest_privacy(text,uuid) FROM PUBLIC,anon,authenticated,lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.lookup_tenant_storefront_interest_privacy(text,uuid) TO anon;
