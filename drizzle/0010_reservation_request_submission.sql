ALTER TABLE "reservation_requests" ADD COLUMN "operation_id" uuid;--> statement-breakpoint
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_operation_id_unique" UNIQUE("operation_id");--> statement-breakpoint
CREATE SCHEMA reservation_submission_private;
--> statement-breakpoint
REVOKE ALL ON SCHEMA reservation_submission_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA reservation_submission_private TO lead_intake_runtime;
--> statement-breakpoint
-- All agenda writers serialize with intake/approval on the same vehicle row.
-- NO KEY UPDATE permits the FK's KEY SHARE lock, including manual block inserts.
CREATE FUNCTION reservation_submission_private.lock_schedule_vehicle() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM 1 FROM public.vehicles WHERE id = OLD.vehicle_id FOR NO KEY UPDATE;
    RETURN OLD;
  END IF;
  PERFORM 1 FROM public.vehicles WHERE id = NEW.vehicle_id FOR NO KEY UPDATE;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER schedule_submission_lock BEFORE INSERT OR UPDATE OR DELETE ON public.vehicle_schedule_blocks
FOR EACH ROW EXECUTE FUNCTION reservation_submission_private.lock_schedule_vehicle();
--> statement-breakpoint
CREATE FUNCTION reservation_submission_private.guard_operation_id() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.operation_id IS DISTINCT FROM OLD.operation_id THEN
    RAISE EXCEPTION 'reservation_operation_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reservation_operation_guard BEFORE UPDATE ON public.reservation_requests
FOR EACH ROW EXECUTE FUNCTION reservation_submission_private.guard_operation_id();
--> statement-breakpoint
CREATE FUNCTION reservation_submission_private.submit(
  p_operation_id uuid, p_vehicle_id uuid, p_pickup_date date, p_return_date date,
  p_full_name text, p_phone text, p_email text, p_city text,
  p_has_definitive_license boolean, p_usage_purpose text, p_has_ear boolean,
  p_driver_platform text, p_preferred_contact_time text
) RETURNS TABLE (lead_id uuid, reservation_request_id uuid, status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  demo_org CONSTANT uuid := '10000000-0000-4000-8000-000000000001';
  persisted_lead public.rental_leads%ROWTYPE;
  persisted_request public.reservation_requests%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'read_committed_required' USING ERRCODE = 'P1001';
  END IF;
  IF p_operation_id IS NULL OR p_vehicle_id IS NULL
     OR p_pickup_date IS NULL OR p_return_date IS NULL
     OR NOT pg_catalog.isfinite(p_pickup_date) OR NOT pg_catalog.isfinite(p_return_date)
     OR p_pickup_date < DATE '0001-01-01' OR p_return_date > DATE '9999-12-31'
     OR p_pickup_date >= p_return_date
     OR p_full_name IS NULL OR pg_catalog.length(pg_catalog.btrim(p_full_name)) NOT BETWEEN 3 AND 120
     OR p_phone IS NULL OR p_phone !~ '^\(?[1-9]{2}\)?\s?(9\s?)?[0-9]{4}[-\s]?[0-9]{4}$'
     OR pg_catalog.length(p_email) > 160
     OR p_city IS NULL OR pg_catalog.length(pg_catalog.btrim(p_city)) NOT BETWEEN 2 AND 100
     OR p_has_definitive_license IS NULL
     OR p_usage_purpose IS NULL OR p_usage_purpose NOT IN ('professional_app', 'other')
     OR (p_usage_purpose = 'professional_app' AND p_has_ear IS NULL)
     OR pg_catalog.length(p_driver_platform) > 80 OR pg_catalog.length(p_preferred_contact_time) > 80 THEN
    RAISE EXCEPTION 'invalid_submission' USING ERRCODE = 'P1001';
  END IF;

  -- Technical retries serialize even before any row exists. A hash collision only waits.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text, 10));
  PERFORM 1 FROM public.vehicles WHERE id = p_vehicle_id AND organization_id = demo_org FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'vehicle_unavailable' USING ERRCODE = 'P1002';
  END IF;
  -- RETURNING/lookup always resolves the real persisted lead, never a discarded UUID.
  INSERT INTO public.rental_leads (
    operation_id, organization_id, vehicle_id, full_name, phone, email, city,
    has_definitive_license, usage_purpose, has_ear, driver_platform, preferred_contact_time, status
  ) VALUES (
    p_operation_id, demo_org, p_vehicle_id, p_full_name, p_phone, p_email, p_city,
    p_has_definitive_license, p_usage_purpose, p_has_ear, p_driver_platform, p_preferred_contact_time, 'new'
  ) ON CONFLICT (operation_id) DO NOTHING;
  SELECT * INTO STRICT persisted_lead FROM public.rental_leads
    WHERE operation_id = p_operation_id FOR UPDATE;
  IF ROW(persisted_lead.organization_id, persisted_lead.vehicle_id, persisted_lead.full_name,
         persisted_lead.phone, persisted_lead.email, persisted_lead.city,
         persisted_lead.has_definitive_license, persisted_lead.usage_purpose, persisted_lead.has_ear,
         persisted_lead.driver_platform, persisted_lead.preferred_contact_time)
     IS DISTINCT FROM ROW(demo_org, p_vehicle_id, p_full_name, p_phone, p_email, p_city,
         p_has_definitive_license, p_usage_purpose, p_has_ear, p_driver_platform, p_preferred_contact_time) THEN
    RAISE EXCEPTION 'operation_conflict' USING ERRCODE = 'P1003';
  END IF;

  SELECT * INTO persisted_request FROM public.reservation_requests WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF ROW(persisted_request.organization_id, persisted_request.lead_id, persisted_request.vehicle_id,
           persisted_request.pickup_date, persisted_request.return_date)
       IS DISTINCT FROM ROW(demo_org, persisted_lead.id, p_vehicle_id, p_pickup_date, p_return_date) THEN
      RAISE EXCEPTION 'operation_conflict' USING ERRCODE = 'P1003';
    END IF;
  ELSE
    -- Separate statement after acquiring the lock gives READ COMMITTED a fresh snapshot.
    IF NOT availability_private.is_demo_vehicle_available(p_vehicle_id, p_pickup_date, p_return_date) THEN
      RAISE EXCEPTION 'vehicle_unavailable' USING ERRCODE = 'P1002';
    END IF;
    INSERT INTO public.reservation_requests (operation_id, organization_id, vehicle_id, lead_id, pickup_date, return_date, status)
      VALUES (p_operation_id, demo_org, p_vehicle_id, persisted_lead.id, p_pickup_date, p_return_date, 'requested')
      RETURNING * INTO persisted_request;
    -- The existing deferred SECURITY INVOKER check must run under this boundary's role.
    -- Drain this submission's check here, then restore deferred validation for
    -- subsequent operations in the caller transaction.
    SET CONSTRAINTS public.reservation_schedule_consistency IMMEDIATE;
    SET CONSTRAINTS public.reservation_schedule_consistency DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notification_outbox AS event
      WHERE event.organization_id = demo_org AND event.reservation_request_id = persisted_request.id
        AND event.event_type = 'reservation.requested') THEN
    RAISE EXCEPTION 'requested_event_missing' USING ERRCODE = 'P1004';
  END IF;
  -- Receipt of submission, not the mutable lifecycle status or a promise of allocation.
  RETURN QUERY SELECT persisted_lead.id, persisted_request.id, 'requested'::text;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA reservation_submission_private FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION reservation_submission_private.submit(uuid, uuid, date, date, text, text, text, text, boolean, text, boolean, text, text)
  TO lead_intake_runtime;
