-- Runs once when the dev database volume is first created.
-- Production roles/passwords are provisioned by infrastructure, not by this file.

CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- API role: subject to row-level security (tenant isolation).
CREATE ROLE rental_app LOGIN PASSWORD 'rental_app';
-- Ingestion role: writes telemetry for every tenant, so it bypasses RLS.
CREATE ROLE rental_ingest LOGIN PASSWORD 'rental_ingest' BYPASSRLS;

GRANT USAGE ON SCHEMA public TO rental_app, rental_ingest;

-- Tables are created later by migrations (as postgres); grant on them automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rental_app, rental_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rental_app, rental_ingest;
