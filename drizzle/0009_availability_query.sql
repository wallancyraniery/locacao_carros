-- Keep the privileged entry point outside the exposed public schema.
CREATE SCHEMA availability_private;
--> statement-breakpoint
REVOKE ALL ON SCHEMA availability_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA availability_private TO lead_intake_runtime;
--> statement-breakpoint
CREATE FUNCTION availability_private.is_demo_vehicle_available(
  requested_vehicle_id uuid,
  requested_pickup_date date,
  requested_return_date date
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE(
    requested_vehicle_id IS NOT NULL
    AND requested_pickup_date IS NOT NULL
    AND requested_return_date IS NOT NULL
    AND pg_catalog.isfinite(requested_pickup_date)
    AND pg_catalog.isfinite(requested_return_date)
    AND requested_pickup_date < requested_return_date
    AND EXISTS (
      SELECT 1 FROM public.vehicles AS vehicle
      WHERE vehicle.id = requested_vehicle_id
        AND vehicle.organization_id = '10000000-0000-4000-8000-000000000001'::uuid
        AND vehicle.is_demo = true
        AND vehicle.status = 'available'
        AND vehicle.operational_status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.vehicle_schedule_blocks AS block
          WHERE block.organization_id = vehicle.organization_id
            AND block.vehicle_id = vehicle.id
            AND block.status = 'active'
            AND pg_catalog.daterange(block.pickup_date, block.return_date, '[)')
                && pg_catalog.daterange(requested_pickup_date, requested_return_date, '[)')
        )
    ), false
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION availability_private.is_demo_vehicle_available(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION availability_private.is_demo_vehicle_available(uuid, date, date)
  TO lead_intake_runtime;
