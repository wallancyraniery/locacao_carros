ALTER TABLE "organizations" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "data_controller" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "privacy_channel_label" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "privacy_channel_url" text;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
-- Existing associations were provisioned administratively. Preserve that ownership
-- while keeping member as the default for future associations.
UPDATE public.organization_memberships SET role = 'owner';--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_role_check" CHECK ("organization_memberships"."role" in ('owner', 'member'));
--> statement-breakpoint
-- The migration principal owns this boundary and must be trusted. Never transfer it
-- to an API/runtime role. Existing memberships retain all their existing access.
DO $$
BEGIN
  IF current_user IN ('anon', 'authenticated', 'lead_intake_runtime') OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'trusted_migration_owner_required';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE SCHEMA onboarding_private;
--> statement-breakpoint
REVOKE ALL ON SCHEMA onboarding_private FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
-- Durable receipt prevents a second initial organization, even after revocation.
CREATE TABLE onboarding_private.initial_organizations (
  user_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL,
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE RESTRICT
);
--> statement-breakpoint
ALTER TABLE onboarding_private.initial_organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON onboarding_private.initial_organizations FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
CREATE FUNCTION onboarding_private.create_initial_organization(
  p_operation_id uuid, p_name text, p_slug text, p_city text,
  p_data_controller text, p_privacy_channel_label text, p_privacy_channel_url text
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  claims jsonb;
  actor uuid;
  receipt onboarding_private.initial_organizations%ROWTYPE;
  organization public.organizations%ROWTYPE;
BEGIN
  -- Same trusted PostgREST claims as the Central policies; never accept a user ID argument.
  BEGIN
    claims := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb;
    actor := (claims ->> 'sub')::uuid;
    IF actor IS NULL OR coalesce((claims ->> 'is_anonymous')::boolean, false) THEN
      RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'read_committed_required' USING ERRCODE = 'P2001';
  END IF;
  IF p_operation_id IS NULL
    OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 120
    OR p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 63 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR p_city IS NULL OR length(btrim(p_city)) NOT BETWEEN 2 AND 100
    OR p_data_controller IS NULL OR length(btrim(p_data_controller)) NOT BETWEEN 2 AND 160
    OR p_privacy_channel_label IS NULL OR length(btrim(p_privacy_channel_label)) NOT BETWEEN 2 AND 80
    OR p_privacy_channel_url IS NULL OR length(p_privacy_channel_url) > 500
    OR p_privacy_channel_url !~ '^(https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(/[A-Za-z0-9._~:/?#\[\]@!$&()*+,;=%-]*)?|mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})$'
    OR (p_name || p_city || p_data_controller || p_privacy_channel_label) ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_onboarding' USING ERRCODE = 'P2001';
  END IF;

  -- Serialize by authenticated identity, including different operation IDs and tabs.
  -- READ COMMITTED gives the statements after the lock a fresh snapshot.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 11));
  SELECT * INTO receipt FROM onboarding_private.initial_organizations WHERE user_id = actor;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.organization_memberships
      WHERE user_id = actor AND organization_id = receipt.organization_id AND role = 'owner') THEN
      RAISE EXCEPTION 'onboarding_already_used' USING ERRCODE = 'P2003';
    END IF;
    SELECT * INTO STRICT organization FROM public.organizations WHERE id = receipt.organization_id;
    IF receipt.operation_id <> p_operation_id OR
      ROW(organization.name, organization.slug, organization.city, organization.data_controller,
          organization.privacy_channel_label, organization.privacy_channel_url)
      IS DISTINCT FROM ROW(btrim(p_name), p_slug, btrim(p_city), btrim(p_data_controller),
          btrim(p_privacy_channel_label), p_privacy_channel_url) THEN
      RAISE EXCEPTION 'onboarding_already_used' USING ERRCODE = 'P2003';
    END IF;
    RETURN receipt.organization_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE user_id = actor) THEN
    RAISE EXCEPTION 'already_associated' USING ERRCODE = 'P2003';
  END IF;

  BEGIN
    INSERT INTO public.organizations (name, slug, city, data_controller, privacy_channel_label, privacy_channel_url)
      VALUES (btrim(p_name), p_slug, btrim(p_city), btrim(p_data_controller), btrim(p_privacy_channel_label), p_privacy_channel_url)
      RETURNING * INTO organization;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slug_unavailable' USING ERRCODE = 'P2002';
  END;
  INSERT INTO public.organization_memberships (user_id, organization_id, role)
    VALUES (actor, organization.id, 'owner');
  INSERT INTO onboarding_private.initial_organizations (user_id, operation_id, organization_id)
    VALUES (actor, p_operation_id, organization.id);
  RETURN organization.id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_private.create_initial_organization(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
GRANT USAGE ON SCHEMA onboarding_private TO authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_private.create_initial_organization(uuid, text, text, text, text, text, text)
  TO authenticated;
--> statement-breakpoint
-- PostgREST exposes public only. This invoker adapter carries no elevated privileges.
CREATE FUNCTION public.create_initial_organization(
  p_operation_id uuid, p_name text, p_slug text, p_city text,
  p_data_controller text, p_privacy_channel_label text, p_privacy_channel_url text
) RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT onboarding_private.create_initial_organization(p_operation_id, p_name, p_slug, p_city,
    p_data_controller, p_privacy_channel_label, p_privacy_channel_url);
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_initial_organization(uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_initial_organization(uuid, text, text, text, text, text, text)
  TO authenticated;
--> statement-breakpoint
GRANT SELECT (id, name, slug, city, data_controller, privacy_channel_label, privacy_channel_url)
  ON public.organizations TO authenticated;
--> statement-breakpoint
GRANT SELECT (role) ON public.organization_memberships TO authenticated;
--> statement-breakpoint
CREATE POLICY owner_organization_select ON public.organizations
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY owner_organization_guard ON public.organizations
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (id IN (SELECT organization_id FROM public.organization_memberships));
