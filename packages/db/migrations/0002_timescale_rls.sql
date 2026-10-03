-- ===========================================================================
-- Telemetry: hypertable, compression, retention, hourly rollup
-- ===========================================================================
SELECT create_hypertable('telemetry', by_range('time', INTERVAL '1 day'));
--> statement-breakpoint
ALTER TABLE telemetry SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'machine_id',
  timescaledb.compress_orderby = 'time DESC'
);
--> statement-breakpoint
SELECT add_compression_policy('telemetry', INTERVAL '7 days');
--> statement-breakpoint
-- Default raw retention; hourly rollups below are kept indefinitely.
SELECT add_retention_policy('telemetry', INTERVAL '90 days');
--> statement-breakpoint
CREATE MATERIALIZED VIEW telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 hour', time) AS bucket,
  organization_id,
  machine_id,
  count(*)                               AS samples,
  max(engine_hours) - min(engine_hours)  AS engine_hours_delta,
  max(engine_hours)                      AS engine_hours_max,
  min(battery_soc)                       AS battery_soc_min,
  avg(battery_soc)                       AS battery_soc_avg,
  max(speed_kmh)                         AS speed_max,
  count(*) FILTER (WHERE ignition)       AS ignition_on_samples
FROM telemetry
GROUP BY bucket, organization_id, machine_id
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy('telemetry_hourly',
  start_offset      => INTERVAL '3 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes');
--> statement-breakpoint

-- ===========================================================================
-- Rentals: a machine cannot be on two overlapping, non-cancelled items
-- ===========================================================================
ALTER TABLE rental_items ADD CONSTRAINT rental_items_no_overlap
  EXCLUDE USING gist (
    machine_id WITH =,
    tstzrange(start_at, coalesce(end_at, 'infinity'::timestamptz)) WITH &&
  ) WHERE (cancelled_at IS NULL);
--> statement-breakpoint

-- ===========================================================================
-- Row-level security (tenant isolation)
-- The API sets app.current_org per transaction (see withTenant in client.ts).
-- ===========================================================================
CREATE FUNCTION app_current_org() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.current_org', true), '')::uuid
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memberships', 'depots', 'machine_models', 'machines', 'gps_devices',
    'machine_state', 'geofences', 'error_code_catalog', 'error_events',
    'customers', 'rental_contracts', 'rental_items', 'payments', 'inspections',
    'maintenance_plans', 'maintenance_records', 'files', 'alert_rules',
    'notifications', 'audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = app_current_org())
         WITH CHECK (organization_id = app_current_org())', t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organizations
  USING (id = app_current_org())
  WITH CHECK (id = app_current_org());
--> statement-breakpoint
-- Users are global; a tenant sees the users that are members of it.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_members ON users
  USING (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = users.id AND m.organization_id = app_current_org()
  ));
--> statement-breakpoint

-- TimescaleDB does not allow RLS on compressed hypertables or continuous
-- aggregates, so the API role reads telemetry only through these filtering
-- views (which run with the owner's rights). Ingestion writes the base table.
CREATE VIEW tenant_telemetry WITH (security_barrier) AS
  SELECT * FROM telemetry WHERE organization_id = app_current_org();
--> statement-breakpoint
CREATE VIEW tenant_telemetry_hourly WITH (security_barrier) AS
  SELECT * FROM telemetry_hourly WHERE organization_id = app_current_org();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rental_app') THEN
    REVOKE ALL ON telemetry, telemetry_hourly FROM rental_app;
    REVOKE ALL ON tenant_telemetry, tenant_telemetry_hourly FROM rental_app;
    GRANT SELECT ON tenant_telemetry, tenant_telemetry_hourly TO rental_app;
  END IF;
END $$;
