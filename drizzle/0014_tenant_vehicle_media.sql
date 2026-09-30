CREATE TABLE "vehicle_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"status" text DEFAULT 'prepared' NOT NULL,
	"position" integer,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_images_status_check" CHECK ("vehicle_images"."status" in ('prepared', 'ready', 'deleting', 'deleted')),
	CONSTRAINT "vehicle_images_position_check" CHECK ("vehicle_images"."position" is null or "vehicle_images"."position" between 0 and 7),
	CONSTRAINT "vehicle_images_mime_type_check" CHECK ("vehicle_images"."mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "vehicle_images_byte_size_check" CHECK ("vehicle_images"."byte_size" between 1 and 5242880),
	CONSTRAINT "vehicle_images_width_check" CHECK ("vehicle_images"."width" is null or "vehicle_images"."width" > 0),
	CONSTRAINT "vehicle_images_height_check" CHECK ("vehicle_images"."height" is null or "vehicle_images"."height" > 0),
	CONSTRAINT "vehicle_images_lifecycle_check" CHECK (
    ("vehicle_images"."status" = 'prepared' and "vehicle_images"."position" is null and "vehicle_images"."width" is null and "vehicle_images"."height" is null and "vehicle_images"."expires_at" is not null)
    or ("vehicle_images"."status" = 'ready' and "vehicle_images"."position" is not null and "vehicle_images"."width" is not null and "vehicle_images"."height" is not null and "vehicle_images"."expires_at" is null)
    or ("vehicle_images"."status" in ('deleting', 'deleted') and "vehicle_images"."position" is null and "vehicle_images"."expires_at" is null)
  )
);
--> statement-breakpoint
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_vehicle_tenant_fk" FOREIGN KEY ("organization_id","vehicle_id") REFERENCES "public"."vehicles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_images_storage_path_unique_idx" ON "vehicle_images" USING btree ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_images_ready_position_unique_idx" ON "vehicle_images" USING btree ("vehicle_id","position") WHERE "vehicle_images"."status" = 'ready';--> statement-breakpoint
CREATE INDEX "vehicle_images_vehicle_status_idx" ON "vehicle_images" USING btree ("vehicle_id","status");--> statement-breakpoint
CREATE INDEX "vehicle_images_organization_vehicle_idx" ON "vehicle_images" USING btree ("organization_id","vehicle_id");
--> statement-breakpoint
DO $$ BEGIN
  IF current_user IN ('anon','authenticated','lead_intake_runtime') OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)
  ) THEN RAISE EXCEPTION 'trusted_migration_owner_required'; END IF;
END $$;
ALTER TABLE public.vehicle_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_images FROM PUBLIC, anon, authenticated, lead_intake_runtime;
CREATE SCHEMA vehicle_media_private;
REVOKE ALL ON SCHEMA vehicle_media_private FROM PUBLIC, anon, authenticated, lead_intake_runtime;
-- Idempotency receipts are separate from the browser-independent object identity.
CREATE TABLE vehicle_media_private.preparations (
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  operation_id uuid NOT NULL,
  image_id uuid NOT NULL UNIQUE REFERENCES public.vehicle_images(id),
  PRIMARY KEY (vehicle_id,operation_id)
);
ALTER TABLE vehicle_media_private.preparations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vehicle_media_private.preparations FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
CREATE FUNCTION vehicle_media_private.owner_tenant() RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb; actor uuid; tenant uuid;
BEGIN
  BEGIN
    claims := nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb;
    actor := (claims->>'sub')::uuid;
    IF actor IS NULL OR coalesce((claims->>'is_anonymous')::boolean,false) THEN
      RAISE EXCEPTION 'owner_required' USING ERRCODE='42501';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'owner_required' USING ERRCODE='42501';
  END;
  SELECT organization_id INTO tenant FROM public.organization_memberships
    WHERE user_id=actor AND role='owner' FOR SHARE;
  IF tenant IS NULL THEN RAISE EXCEPTION 'owner_required' USING ERRCODE='42501'; END IF;
  RETURN tenant;
END $$;
CREATE FUNCTION vehicle_media_private.lock_vehicle(p_vehicle uuid, p_tenant uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'read_committed_required' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.vehicles WHERE id=p_vehicle AND organization_id=p_tenant AND NOT is_demo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vehicle_unavailable' USING ERRCODE='42501'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION vehicle_media_private.prepare(p_vehicle_id uuid,p_operation_id uuid,p_mime_type text,p_byte_size integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant uuid; image public.vehicle_images%ROWTYPE; image_id uuid; suffix text;
BEGIN
  tenant := vehicle_media_private.owner_tenant();
  PERFORM vehicle_media_private.lock_vehicle(p_vehicle_id,tenant);
  IF p_operation_id IS NULL OR p_mime_type IS NULL OR p_mime_type NOT IN ('image/jpeg','image/png','image/webp')
    OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 5242880 THEN
    RAISE EXCEPTION 'invalid_image' USING ERRCODE='22023';
  END IF;
  -- Expired paths occupy their slot until Storage API removal is confirmed.
  UPDATE public.vehicle_images SET status='deleting',expires_at=NULL,updated_at=now()
    WHERE vehicle_id=p_vehicle_id AND status='prepared' AND expires_at<=now();
  SELECT i.* INTO image FROM public.vehicle_images i JOIN vehicle_media_private.preparations r ON r.image_id=i.id
    WHERE r.vehicle_id=p_vehicle_id AND r.operation_id=p_operation_id;
  IF FOUND THEN
    IF image.mime_type<>p_mime_type OR image.byte_size<>p_byte_size THEN
      RAISE EXCEPTION 'operation_conflict' USING ERRCODE='22023';
    END IF;
    RETURN to_jsonb(image);
  END IF;
  IF (SELECT count(*) FROM public.vehicle_images WHERE vehicle_id=p_vehicle_id AND status IN ('prepared','ready','deleting'))>=8 THEN
    RAISE EXCEPTION 'image_limit' USING ERRCODE='22023';
  END IF;
  image_id := gen_random_uuid();
  suffix := CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
  INSERT INTO public.vehicle_images(id,organization_id,vehicle_id,storage_path,mime_type,byte_size,expires_at)
    VALUES(image_id,tenant,p_vehicle_id,tenant::text||'/'||p_vehicle_id::text||'/'||image_id::text||'.'||suffix,
      p_mime_type,p_byte_size,now()+interval '2 hours') RETURNING * INTO image;
  INSERT INTO vehicle_media_private.preparations VALUES(p_vehicle_id,p_operation_id,image_id);
  RETURN to_jsonb(image);
END $$;
--> statement-breakpoint
CREATE FUNCTION vehicle_media_private.list_images(p_vehicle_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant uuid; result jsonb;
BEGIN
  tenant := vehicle_media_private.owner_tenant();
  PERFORM vehicle_media_private.lock_vehicle(p_vehicle_id,tenant);
  UPDATE public.vehicle_images SET status='deleting',expires_at=NULL,updated_at=now()
    WHERE vehicle_id=p_vehicle_id AND status='prepared' AND expires_at<=now();
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.position NULLS LAST,i.created_at,i.id),'[]'::jsonb)
    INTO result FROM public.vehicle_images i WHERE vehicle_id=p_vehicle_id AND status<>'deleted';
  RETURN result;
END $$;
--> statement-breakpoint
CREATE FUNCTION vehicle_media_private.reorder(p_vehicle_id uuid,p_image_ids uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant uuid; expected uuid[]; actual uuid[]; item uuid; n integer:=0;
BEGIN
  tenant:=vehicle_media_private.owner_tenant();
  PERFORM vehicle_media_private.lock_vehicle(p_vehicle_id,tenant);
  SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) INTO expected FROM public.vehicle_images WHERE vehicle_id=p_vehicle_id AND status='ready';
  SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[]) INTO actual FROM unnest(p_image_ids) id;
  IF p_image_ids IS NULL OR cardinality(p_image_ids)>8 OR actual<>expected THEN
    RAISE EXCEPTION 'invalid_order' USING ERRCODE='22023';
  END IF;
  -- Temporarily leave ready inside this transaction to avoid immediate unique-index
  -- collisions. No reader can observe this intermediate state.
  UPDATE public.vehicle_images SET status='deleting',position=NULL WHERE vehicle_id=p_vehicle_id AND status='ready';
  FOREACH item IN ARRAY p_image_ids LOOP
    UPDATE public.vehicle_images SET status='ready',position=n,updated_at=now() WHERE id=item;
    n:=n+1;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION vehicle_media_private.begin_delete(p_vehicle_id uuid,p_image_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant uuid; image public.vehicle_images%ROWTYPE; item record; n integer:=0;
BEGIN
  tenant:=vehicle_media_private.owner_tenant();
  PERFORM vehicle_media_private.lock_vehicle(p_vehicle_id,tenant);
  SELECT * INTO image FROM public.vehicle_images WHERE id=p_image_id AND vehicle_id=p_vehicle_id AND organization_id=tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'image_unavailable' USING ERRCODE='42501'; END IF;
  IF image.status<>'deleted' THEN
    UPDATE public.vehicle_images SET status='deleting',position=NULL,expires_at=NULL,updated_at=now() WHERE id=p_image_id RETURNING * INTO image;
    FOR item IN SELECT id FROM public.vehicle_images WHERE vehicle_id=p_vehicle_id AND status='ready' ORDER BY position,id LOOP
      UPDATE public.vehicle_images SET position=n,updated_at=now() WHERE id=item.id;
      n:=n+1;
    END LOOP;
  END IF;
  RETURN to_jsonb(image);
END $$;
--> statement-breakpoint
-- Only the restricted server runtime may attest real decoding or Storage removal.
-- Actor is supplied by the already authenticated server, never by the form.
CREATE FUNCTION vehicle_media_private.finish(p_actor uuid,p_vehicle_id uuid,p_image_id uuid,p_delete boolean,p_width integer,p_height integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant uuid; image public.vehicle_images%ROWTYPE; next_position integer;
BEGIN
  SELECT organization_id INTO tenant FROM public.organization_memberships WHERE user_id=p_actor AND role='owner' FOR SHARE;
  IF tenant IS NULL THEN RAISE EXCEPTION 'owner_required' USING ERRCODE='42501'; END IF;
  PERFORM vehicle_media_private.lock_vehicle(p_vehicle_id,tenant);
  SELECT * INTO image FROM public.vehicle_images WHERE id=p_image_id AND vehicle_id=p_vehicle_id AND organization_id=tenant;
  IF NOT FOUND OR p_delete IS NULL THEN RAISE EXCEPTION 'image_unavailable' USING ERRCODE='42501'; END IF;
  IF p_delete THEN
    IF image.status='deleted' THEN RETURN; END IF;
    IF image.status<>'deleting' THEN RAISE EXCEPTION 'invalid_state' USING ERRCODE='22023'; END IF;
    UPDATE public.vehicle_images SET status='deleted',updated_at=now() WHERE id=p_image_id;
  ELSE
    IF p_width IS NULL OR p_height IS NULL OR p_width NOT BETWEEN 1 AND 16384 OR p_height NOT BETWEEN 1 AND 16384
      OR p_width::bigint*p_height>25000000 THEN RAISE EXCEPTION 'invalid_dimensions' USING ERRCODE='22023'; END IF;
    IF image.status='ready' AND image.width=p_width AND image.height=p_height THEN RETURN; END IF;
    IF image.status<>'prepared' OR image.expires_at<=now() THEN RAISE EXCEPTION 'invalid_state' USING ERRCODE='22023'; END IF;
    SELECT count(*) INTO next_position FROM public.vehicle_images WHERE vehicle_id=p_vehicle_id AND status='ready';
    UPDATE public.vehicle_images SET status='ready',position=next_position,width=p_width,height=p_height,expires_at=NULL,updated_at=now() WHERE id=p_image_id;
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION vehicle_media_private.storage_allowed(p_path text,p_operation text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb; actor uuid; anonymous boolean;
BEGIN
  IF p_operation='public_read' THEN
    RETURN EXISTS(SELECT 1 FROM public.vehicle_images i JOIN public.vehicles v ON v.id=i.vehicle_id AND v.organization_id=i.organization_id
      JOIN public.organizations o ON o.id=i.organization_id WHERE i.storage_path=p_path AND i.status='ready'
      AND o.storefront_status='published' AND NOT v.is_demo AND v.operational_status='active' AND v.status='available');
  END IF;
  BEGIN
    claims:=nullif(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb;
    actor:=(claims->>'sub')::uuid;
    anonymous:=coalesce((claims->>'is_anonymous')::boolean,false);
  EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  IF actor IS NULL OR anonymous THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM public.vehicle_images i JOIN public.organization_memberships m ON m.organization_id=i.organization_id
    WHERE i.storage_path=p_path AND m.user_id=actor AND m.role='owner' AND
      CASE p_operation WHEN 'insert' THEN i.status='prepared' AND i.expires_at>now()
        WHEN 'delete' THEN i.status='deleting'
        WHEN 'read' THEN i.status IN ('prepared','ready','deleting') ELSE false END);
END $$;
--> statement-breakpoint
CREATE FUNCTION vehicle_media_private.public_vehicle(p_vehicle_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('id',v.id,'brand',v.brand,'model',v.model,'version',v.version,'year',v.year,'color',v.color,
    'weekly_price_cents',v.weekly_price_cents,'images',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',i.id,'storage_path',i.storage_path,'width',i.width,'height',i.height,'position',i.position) ORDER BY i.position,i.id)
      FROM public.vehicle_images i WHERE i.vehicle_id=v.id AND i.organization_id=v.organization_id AND i.status='ready'),'[]'::jsonb))
  FROM public.vehicles v JOIN public.organizations o ON o.id=v.organization_id WHERE v.id=p_vehicle_id
    AND o.storefront_status='published' AND NOT v.is_demo AND v.operational_status='active' AND v.status='available';
$$;
CREATE FUNCTION vehicle_media_private.lookup(p_slug text,p_page integer,p_vehicle_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE org public.organizations%ROWTYPE; vehicle jsonb; result jsonb;
BEGIN
  IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 63 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RETURN NULL; END IF;
  SELECT * INTO org FROM public.organizations WHERE slug=p_slug AND storefront_status='published';
  IF NOT FOUND THEN RETURN NULL; END IF;
  result:=jsonb_build_object('slug',org.slug,'name',org.name,'city',org.city);
  IF p_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.vehicles WHERE id=p_vehicle_id AND organization_id=org.id) THEN RETURN NULL; END IF;
    vehicle:=vehicle_media_private.public_vehicle(p_vehicle_id);
    IF vehicle IS NULL THEN RETURN NULL; END IF;
    RETURN result||jsonb_build_object('vehicle',vehicle);
  END IF;
  RETURN result||jsonb_build_object('vehicles',coalesce((SELECT jsonb_agg(vehicle_media_private.public_vehicle(x.id) ORDER BY x.created_at,x.id)
    FROM (SELECT id,created_at FROM public.vehicles WHERE organization_id=org.id AND NOT is_demo AND operational_status='active' AND status='available'
      ORDER BY created_at,id LIMIT 24 OFFSET (p_page-1)*24) x),'[]'::jsonb),
    'hasNext',EXISTS(SELECT 1 FROM public.vehicles WHERE organization_id=org.id AND NOT is_demo AND operational_status='active' AND status='available'
      ORDER BY created_at,id LIMIT 1 OFFSET p_page*24));
END $$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vehicle_media_private FROM PUBLIC,anon,authenticated,lead_intake_runtime;
GRANT USAGE ON SCHEMA vehicle_media_private TO anon,authenticated,lead_intake_runtime;
GRANT EXECUTE ON FUNCTION vehicle_media_private.prepare(uuid,uuid,text,integer),vehicle_media_private.list_images(uuid),
  vehicle_media_private.reorder(uuid,uuid[]),vehicle_media_private.begin_delete(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION vehicle_media_private.finish(uuid,uuid,uuid,boolean,integer,integer) TO lead_intake_runtime;
GRANT EXECUTE ON FUNCTION vehicle_media_private.storage_allowed(text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION vehicle_media_private.lookup(text,integer,uuid) TO anon;

--> statement-breakpoint
CREATE FUNCTION public.prepare_vehicle_media(p_vehicle_id uuid,p_operation_id uuid,p_mime_type text,p_byte_size integer) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$ SELECT vehicle_media_private.prepare(p_vehicle_id,p_operation_id,p_mime_type,p_byte_size); $$;
REVOKE ALL ON FUNCTION public.prepare_vehicle_media(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.prepare_vehicle_media(uuid,uuid,text,integer) TO authenticated;

--> statement-breakpoint
CREATE FUNCTION public.list_vehicle_media(p_vehicle_id uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$ SELECT vehicle_media_private.list_images(p_vehicle_id); $$;
REVOKE ALL ON FUNCTION public.list_vehicle_media(uuid) FROM PUBLIC,anon,authenticated,lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.list_vehicle_media(uuid) TO authenticated;

--> statement-breakpoint
CREATE FUNCTION public.reorder_vehicle_media(p_vehicle_id uuid,p_image_ids uuid[]) RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$ SELECT vehicle_media_private.reorder(p_vehicle_id,p_image_ids); $$;
REVOKE ALL ON FUNCTION public.reorder_vehicle_media(uuid,uuid[]) FROM PUBLIC,anon,authenticated,lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.reorder_vehicle_media(uuid,uuid[]) TO authenticated;

--> statement-breakpoint
CREATE FUNCTION public.delete_vehicle_media(p_vehicle_id uuid,p_image_id uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$ SELECT vehicle_media_private.begin_delete(p_vehicle_id,p_image_id); $$;
REVOKE ALL ON FUNCTION public.delete_vehicle_media(uuid,uuid) FROM PUBLIC,anon,authenticated,lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.delete_vehicle_media(uuid,uuid) TO authenticated;

--> statement-breakpoint
CREATE FUNCTION public.lookup_tenant_storefront_media(p_slug text,p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT vehicle_media_private.lookup(p_slug,p_page,NULL); $$;
REVOKE ALL ON FUNCTION public.lookup_tenant_storefront_media(text,integer) FROM PUBLIC,anon,authenticated,lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.lookup_tenant_storefront_media(text,integer) TO anon;

--> statement-breakpoint
CREATE FUNCTION public.lookup_tenant_storefront_vehicle(p_slug text,p_vehicle_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT vehicle_media_private.lookup(p_slug,1,p_vehicle_id); $$;
REVOKE ALL ON FUNCTION public.lookup_tenant_storefront_vehicle(text,uuid) FROM PUBLIC,anon,authenticated,lead_intake_runtime;
GRANT EXECUTE ON FUNCTION public.lookup_tenant_storefront_vehicle(text,uuid) TO anon;

--> statement-breakpoint
-- Storage is managed by Supabase: policies only, no object DML or custom triggers.
-- User credentials cannot INSERT or mint upload capabilities. A server-only
-- signer issues fixed upsert=false capabilities after the owner RPC authorizes
-- the generated path. This does not depend on HTTP method, path or headers.
-- Plain PostgreSQL tests exercise predicates separately; activation audits real Storage.
DO $$ BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY vehicle_media_owner_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id=''vehicle-media'' AND vehicle_media_private.storage_allowed(name,''read''))';
    EXECUTE 'CREATE POLICY vehicle_media_public_read ON storage.objects FOR SELECT TO anon USING (bucket_id=''vehicle-media'' AND vehicle_media_private.storage_allowed(name,''public_read''))';
    EXECUTE 'CREATE POLICY vehicle_media_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id=''vehicle-media'' AND vehicle_media_private.storage_allowed(name,''delete''))';
    -- Restrictive guards preserve other buckets but prevent pre-existing broad
    -- permissive policies from bypassing this bucket's lifecycle and tenancy.
    EXECUTE 'CREATE POLICY vehicle_media_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK (bucket_id<>''vehicle-media'')';
    EXECUTE 'CREATE POLICY vehicle_media_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING (bucket_id<>''vehicle-media'' OR vehicle_media_private.storage_allowed(name,''read'') OR vehicle_media_private.storage_allowed(name,''public_read''))';
    EXECUTE 'CREATE POLICY vehicle_media_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING (bucket_id<>''vehicle-media'' OR vehicle_media_private.storage_allowed(name,''delete''))';
    EXECUTE 'CREATE POLICY vehicle_media_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING (bucket_id<>''vehicle-media'') WITH CHECK (bucket_id<>''vehicle-media'')';
  END IF;
END $$;
