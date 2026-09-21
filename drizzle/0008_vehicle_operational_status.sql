CREATE TYPE "public"."vehicle_operational_status" AS ENUM('active', 'inactive');
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "operational_status" "vehicle_operational_status";
--> statement-breakpoint
-- Ambiguous legacy states require an explicit operational decision.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE status IN ('reserved', 'rented', 'maintenance')
  ) THEN
    RAISE EXCEPTION 'vehicle_operational_status_backfill_unsupported_legacy_status'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
--> statement-breakpoint
UPDATE public.vehicles
SET operational_status = CASE status
  WHEN 'available' THEN 'active'::public.vehicle_operational_status
  WHEN 'inactive' THEN 'inactive'::public.vehicle_operational_status
END;
--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "operational_status" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "vehicles_organization_operational_status_idx"
  ON "vehicles" USING btree ("organization_id","operational_status");
--> statement-breakpoint
-- Keep status = available in both restrictive policies as a fail-closed
-- compatibility guard while runtime eligibility moves to operational_status.
GRANT SELECT (operational_status) ON public.vehicles TO lead_intake_runtime;
REVOKE SELECT (operational_status) ON public.vehicles FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
ALTER POLICY "lead_intake_runtime_guard_available_demo_vehicle_select" ON public.vehicles
  USING (
    organization_id = '10000000-0000-4000-8000-000000000001'::uuid
    AND is_demo = true
    AND status = 'available'
    AND operational_status = 'active'
  );
--> statement-breakpoint
ALTER POLICY "lead_intake_runtime_guard_new_demo_lead_insert" ON public.rental_leads
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
        AND vehicles.operational_status = 'active'
    )
  );
--> statement-breakpoint
-- Approval and inactivation serialize on the vehicle row. A later inactivation
-- does not rewrite or release reservations already approved.
CREATE OR REPLACE FUNCTION public.reservation_request_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  vehicle_state public.vehicle_operational_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'requested' THEN
      RAISE EXCEPTION 'reservation_must_start_requested' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF ROW(NEW.id, NEW.organization_id, NEW.vehicle_id, NEW.lead_id, NEW.pickup_date, NEW.return_date, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.vehicle_id, OLD.lead_id, OLD.pickup_date, OLD.return_date, OLD.created_at) THEN
      RAISE EXCEPTION 'reservation_identity_and_period_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT ((OLD.status = 'requested' AND NEW.status IN ('approved', 'rejected', 'cancelled'))
           OR (OLD.status = 'approved' AND NEW.status = 'cancelled')) THEN
        RAISE EXCEPTION 'invalid_reservation_transition' USING ERRCODE = '23514';
      END IF;
      IF NEW.status = 'approved' THEN
        SELECT operational_status INTO vehicle_state
        FROM public.vehicles
        WHERE id = NEW.vehicle_id AND organization_id = NEW.organization_id
        FOR UPDATE;
        IF vehicle_state IS DISTINCT FROM 'active'::public.vehicle_operational_status THEN
          RAISE EXCEPTION 'reservation_vehicle_not_active' USING ERRCODE = '23514';
        END IF;
      END IF;
      IF NEW.status IN ('approved', 'rejected') THEN
        NEW.decided_at := transaction_timestamp();
      ELSE
        NEW.cancelled_at := transaction_timestamp();
        NEW.decided_at := OLD.decided_at;
        NEW.decided_by := OLD.decided_by;
        NEW.decision_reason := OLD.decision_reason;
      END IF;
    ELSIF ROW(NEW.decided_at, NEW.decided_by, NEW.decision_reason, NEW.cancelled_at, NEW.cancelled_by)
       IS DISTINCT FROM ROW(OLD.decided_at, OLD.decided_by, OLD.decision_reason, OLD.cancelled_at, OLD.cancelled_by) THEN
      RAISE EXCEPTION 'reservation_decision_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status = 'rejected' AND coalesce(length(trim(NEW.decision_reason)), 0) = 0 THEN
    RAISE EXCEPTION 'rejection_reason_required' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION public.reservation_request_guard()
  FROM PUBLIC, anon, authenticated, lead_intake_runtime;
