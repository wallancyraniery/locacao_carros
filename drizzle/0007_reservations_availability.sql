ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_id_unique" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "rental_leads" ADD CONSTRAINT "rental_leads_organization_id_id_unique" UNIQUE("organization_id","id");
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reservation_request_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_event_unique" UNIQUE("reservation_request_id","event_type"),
	CONSTRAINT "notification_outbox_event_check" CHECK ("notification_outbox"."event_type" in ('reservation.requested', 'reservation.approved', 'reservation.rejected', 'reservation.cancelled')),
	CONSTRAINT "notification_outbox_status_check" CHECK ("notification_outbox"."status" in ('pending', 'processing', 'failed', 'sent') and (("notification_outbox"."status" = 'processing') = ("notification_outbox"."locked_at" is not null)) and (("notification_outbox"."status" = 'sent') = ("notification_outbox"."sent_at" is not null))),
	CONSTRAINT "notification_outbox_attempts_check" CHECK ("notification_outbox"."attempts" >= 0),
	CONSTRAINT "notification_outbox_error_check" CHECK ("notification_outbox"."last_error_code" is null or "notification_outbox"."last_error_code" in ('provider_unavailable', 'rate_limited', 'delivery_rejected', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reservation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"pickup_date" date NOT NULL,
	"return_date" date NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"request_notes" text,
	"decision_reason" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_requests_organization_id_id_unique" UNIQUE("organization_id","id"),
	CONSTRAINT "reservation_requests_period_check" CHECK ("reservation_requests"."pickup_date" < "reservation_requests"."return_date" and isfinite("reservation_requests"."pickup_date") and isfinite("reservation_requests"."return_date")),
	CONSTRAINT "reservation_requests_status_check" CHECK ("reservation_requests"."status" in ('requested', 'approved', 'rejected', 'cancelled')),
	CONSTRAINT "reservation_requests_notes_check" CHECK (char_length("reservation_requests"."request_notes") <= 1000 and char_length("reservation_requests"."decision_reason") <= 1000),
	CONSTRAINT "reservation_requests_decision_check" CHECK (("reservation_requests"."status" = 'requested' and "reservation_requests"."decided_at" is null and "reservation_requests"."decided_by" is null) or ("reservation_requests"."status" in ('approved', 'rejected') and "reservation_requests"."decided_at" is not null and "reservation_requests"."decided_by" is not null) or ("reservation_requests"."status" = 'cancelled' and (("reservation_requests"."decided_at" is null and "reservation_requests"."decided_by" is null) or ("reservation_requests"."decided_at" is not null and "reservation_requests"."decided_by" is not null)))),
	CONSTRAINT "reservation_requests_cancellation_check" CHECK (("reservation_requests"."status" = 'cancelled' and "reservation_requests"."cancelled_at" is not null and "reservation_requests"."cancelled_by" is not null) or ("reservation_requests"."status" <> 'cancelled' and "reservation_requests"."cancelled_at" is null and "reservation_requests"."cancelled_by" is null))
);
--> statement-breakpoint
ALTER TABLE "reservation_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vehicle_schedule_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"reservation_request_id" uuid,
	"kind" text NOT NULL,
	"pickup_date" date NOT NULL,
	"return_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_schedule_blocks_request_unique" UNIQUE("reservation_request_id"),
	CONSTRAINT "vehicle_schedule_blocks_period_check" CHECK ("vehicle_schedule_blocks"."pickup_date" < "vehicle_schedule_blocks"."return_date" and isfinite("vehicle_schedule_blocks"."pickup_date") and isfinite("vehicle_schedule_blocks"."return_date")),
	CONSTRAINT "vehicle_schedule_blocks_kind_check" CHECK ("vehicle_schedule_blocks"."kind" in ('reservation', 'maintenance', 'preparation', 'manual') and (("vehicle_schedule_blocks"."kind" = 'reservation') = ("vehicle_schedule_blocks"."reservation_request_id" is not null))),
	CONSTRAINT "vehicle_schedule_blocks_status_check" CHECK (("vehicle_schedule_blocks"."status" = 'active' and "vehicle_schedule_blocks"."released_at" is null) or ("vehicle_schedule_blocks"."status" = 'released' and "vehicle_schedule_blocks"."released_at" is not null)),
	CONSTRAINT "vehicle_schedule_blocks_reason_check" CHECK (char_length("vehicle_schedule_blocks"."reason") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "vehicle_schedule_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"vehicle_preference" text,
	"lead_id" uuid NOT NULL,
	"pickup_date" date NOT NULL,
	"return_date" date NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_period_check" CHECK ("waitlist_entries"."pickup_date" < "waitlist_entries"."return_date" and isfinite("waitlist_entries"."pickup_date") and isfinite("waitlist_entries"."return_date")),
	CONSTRAINT "waitlist_entries_target_check" CHECK (("waitlist_entries"."vehicle_id" is not null) <> ("waitlist_entries"."vehicle_preference" is not null) and ("waitlist_entries"."vehicle_preference" is null or char_length(trim("waitlist_entries"."vehicle_preference")) between 1 and 200)),
	CONSTRAINT "waitlist_entries_status_check" CHECK ("waitlist_entries"."status" in ('waiting', 'notified', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_request_tenant_fk" FOREIGN KEY ("organization_id","reservation_request_id") REFERENCES "public"."reservation_requests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_vehicle_tenant_fk" FOREIGN KEY ("organization_id","vehicle_id") REFERENCES "public"."vehicles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_lead_tenant_fk" FOREIGN KEY ("organization_id","lead_id") REFERENCES "public"."rental_leads"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_schedule_blocks" ADD CONSTRAINT "vehicle_schedule_blocks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_schedule_blocks" ADD CONSTRAINT "vehicle_schedule_blocks_vehicle_tenant_fk" FOREIGN KEY ("organization_id","vehicle_id") REFERENCES "public"."vehicles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_schedule_blocks" ADD CONSTRAINT "vehicle_schedule_blocks_request_tenant_fk" FOREIGN KEY ("organization_id","reservation_request_id") REFERENCES "public"."reservation_requests"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_vehicle_tenant_fk" FOREIGN KEY ("organization_id","vehicle_id") REFERENCES "public"."vehicles"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_lead_tenant_fk" FOREIGN KEY ("organization_id","lead_id") REFERENCES "public"."rental_leads"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_outbox_dispatch_idx" ON "notification_outbox" USING btree ("status","available_at") WHERE "notification_outbox"."status" in ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "notification_outbox_organization_idx" ON "notification_outbox" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reservation_requests_organization_status_idx" ON "reservation_requests" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "reservation_requests_vehicle_idx" ON "reservation_requests" USING btree ("organization_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "reservation_requests_lead_idx" ON "reservation_requests" USING btree ("organization_id","lead_id");--> statement-breakpoint
CREATE INDEX "vehicle_schedule_blocks_vehicle_idx" ON "vehicle_schedule_blocks" USING btree ("organization_id","vehicle_id");--> statement-breakpoint
CREATE INDEX "waitlist_entries_vehicle_idx" ON "waitlist_entries" USING btree ("organization_id","vehicle_id","status");--> statement-breakpoint
CREATE INDEX "waitlist_entries_lead_idx" ON "waitlist_entries" USING btree ("organization_id","lead_id");--> statement-breakpoint
-- Hand-written invariants: Drizzle does not model exclusion constraints/triggers.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE public.vehicle_schedule_blocks
  ADD CONSTRAINT vehicle_schedule_blocks_no_active_overlap
  EXCLUDE USING gist (vehicle_id WITH =, daterange(pickup_date, return_date, '[)') WITH &&)
  WHERE (status = 'active');
--> statement-breakpoint
-- Explicitly remove Supabase default grants as well as PUBLIC inheritance.
REVOKE ALL PRIVILEGES ON TABLE public.reservation_requests, public.vehicle_schedule_blocks,
  public.waitlist_entries, public.notification_outbox FROM PUBLIC, anon, authenticated, lead_intake_runtime;
--> statement-breakpoint
CREATE FUNCTION public.reservation_request_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
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
      IF NEW.status IN ('approved', 'rejected') THEN
        NEW.decided_at := transaction_timestamp();
      ELSE
        NEW.cancelled_at := transaction_timestamp();
        -- Cancellation retains the original decision, including its author/reason.
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
CREATE TRIGGER reservation_request_guard BEFORE INSERT OR UPDATE ON public.reservation_requests
FOR EACH ROW EXECUTE FUNCTION public.reservation_request_guard();
--> statement-breakpoint
CREATE FUNCTION public.reservation_request_effects() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  END IF;
  IF NEW.status = 'approved' THEN
    INSERT INTO public.vehicle_schedule_blocks
      (organization_id, vehicle_id, reservation_request_id, kind, pickup_date, return_date)
    VALUES (NEW.organization_id, NEW.vehicle_id, NEW.id, 'reservation', NEW.pickup_date, NEW.return_date);
  ELSIF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
    UPDATE public.vehicle_schedule_blocks SET status = 'released', released_at = transaction_timestamp()
    WHERE reservation_request_id = NEW.id;
  END IF;
  INSERT INTO public.notification_outbox (organization_id, reservation_request_id, event_type)
  VALUES (NEW.organization_id, NEW.id, 'reservation.' || NEW.status);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reservation_request_effects AFTER INSERT OR UPDATE ON public.reservation_requests
FOR EACH ROW EXECUTE FUNCTION public.reservation_request_effects();
--> statement-breakpoint
CREATE FUNCTION public.vehicle_schedule_block_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF ROW(NEW.id, NEW.organization_id, NEW.vehicle_id, NEW.reservation_request_id, NEW.kind, NEW.pickup_date, NEW.return_date, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.vehicle_id, OLD.reservation_request_id, OLD.kind, OLD.pickup_date, OLD.return_date, OLD.created_at) THEN
    RAISE EXCEPTION 'schedule_block_identity_and_period_immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'released' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'released_schedule_block_is_terminal' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER vehicle_schedule_block_guard BEFORE UPDATE ON public.vehicle_schedule_blocks
FOR EACH ROW EXECUTE FUNCTION public.vehicle_schedule_block_guard();
--> statement-breakpoint
-- Deferred checks see the final state of approval/cancellation and prevent direct
-- block writes from silently separating the reservation from its agenda.
CREATE FUNCTION public.reservation_schedule_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  request_id uuid;
  request_row public.reservation_requests%ROWTYPE;
  block_row public.vehicle_schedule_blocks%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'reservation_requests' THEN
    request_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    request_id := OLD.reservation_request_id;
  ELSE
    request_id := NEW.reservation_request_id;
  END IF;
  IF request_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO request_row FROM public.reservation_requests WHERE id = request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO block_row FROM public.vehicle_schedule_blocks WHERE reservation_request_id = request_id;
  IF (request_row.status = 'approved' AND (NOT FOUND OR block_row.status <> 'active'))
     OR (request_row.status = 'cancelled' AND request_row.decided_at IS NOT NULL
       AND (NOT FOUND OR block_row.status <> 'released'))
     OR (FOUND AND (
       ROW(block_row.organization_id, block_row.vehicle_id, block_row.pickup_date, block_row.return_date)
         IS DISTINCT FROM ROW(request_row.organization_id, request_row.vehicle_id, request_row.pickup_date, request_row.return_date)
       OR request_row.status NOT IN ('approved', 'cancelled')
       OR (request_row.status = 'cancelled' AND block_row.status <> 'released')
     )) THEN
    RAISE EXCEPTION 'reservation_schedule_inconsistent' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER reservation_schedule_consistency
AFTER INSERT OR UPDATE ON public.reservation_requests DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.reservation_schedule_consistency();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER block_reservation_consistency
AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_schedule_blocks DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.reservation_schedule_consistency();
--> statement-breakpoint
CREATE FUNCTION public.reservation_auxiliary_update_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'reservation_auxiliary_identity_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'notification_outbox' THEN
    IF NEW.reservation_request_id <> OLD.reservation_request_id OR NEW.event_type <> OLD.event_type OR NEW.attempts < OLD.attempts THEN
      RAISE EXCEPTION 'outbox_event_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := transaction_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notification_outbox_update_guard BEFORE UPDATE ON public.notification_outbox
FOR EACH ROW EXECUTE FUNCTION public.reservation_auxiliary_update_guard();
--> statement-breakpoint
CREATE TRIGGER waitlist_entries_update_guard BEFORE UPDATE ON public.waitlist_entries
FOR EACH ROW EXECUTE FUNCTION public.reservation_auxiliary_update_guard();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION public.reservation_request_guard(), public.reservation_request_effects(),
  public.vehicle_schedule_block_guard(), public.reservation_schedule_consistency(),
  public.reservation_auxiliary_update_guard() FROM PUBLIC, anon, authenticated, lead_intake_runtime;
