import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, id, organizationId, point } from './_common.js';
import { errorSeverity } from './enums.js';
import { machines } from './fleet.js';
import { users } from './tenancy.js';

// A function so the table and the view each get their own column builders.
const telemetryColumns = () => ({
  time: timestamp('time', { withTimezone: true }).notNull(),
  organizationId: uuid('organization_id').notNull(),
  machineId: uuid('machine_id').notNull(),
  location: point('location'),
  speedKmh: doublePrecision('speed_kmh'),
  heading: doublePrecision('heading'),
  batterySoc: doublePrecision('battery_soc'),
  engineHours: doublePrecision('engine_hours'),
  ignition: boolean('ignition'),
  errorCodes: text('error_codes').array(),
  raw: jsonb('raw'),
});

/**
 * Raw telemetry, converted to a TimescaleDB hypertable by a custom migration
 * (compression, retention and hourly rollups are configured there too).
 * No foreign keys: this is the hot write path.
 */
export const telemetry = pgTable(
  'telemetry',
  telemetryColumns(),
  // Also deduplicates re-delivered MQTT messages (insert ... on conflict do nothing).
  (t) => [primaryKey({ columns: [t.machineId, t.time] })],
);

/** Read-only, tenant-filtered view of `telemetry` for the API role (see migration 0002). */
export const tenantTelemetry = pgView('tenant_telemetry', telemetryColumns()).existing();

/** Tenant-filtered view of the hourly continuous aggregate. */
export const tenantTelemetryHourly = pgView('tenant_telemetry_hourly', {
  bucket: timestamp('bucket', { withTimezone: true }).notNull(),
  organizationId: uuid('organization_id').notNull(),
  machineId: uuid('machine_id').notNull(),
  samples: doublePrecision('samples').notNull(),
  engineHoursDelta: doublePrecision('engine_hours_delta'),
  engineHoursMax: doublePrecision('engine_hours_max'),
  batterySocMin: doublePrecision('battery_soc_min'),
  batterySocAvg: doublePrecision('battery_soc_avg'),
  speedMax: doublePrecision('speed_max'),
  ignitionOnSamples: doublePrecision('ignition_on_samples'),
}).existing();

export const errorCodeCatalog = pgTable(
  'error_code_catalog',
  {
    id: id(),
    organizationId: organizationId(),
    provider: text('provider').notNull(),
    code: text('code').notNull(),
    description: text('description').notNull(),
    severity: errorSeverity('severity').notNull(),
    recommendedAction: text('recommended_action'),
  },
  (t) => [uniqueIndex('error_code_catalog_uq').on(t.organizationId, t.provider, t.code)],
);

/** One row per occurrence: opened when a code appears, closed when it clears. */
export const errorEvents = pgTable(
  'error_events',
  {
    id: id(),
    organizationId: organizationId(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    /** Copied from the catalog at open time; null when the code is not catalogued. */
    severity: errorSeverity('severity'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    index('error_events_machine_started_idx').on(t.machineId, t.startedAt),
    uniqueIndex('error_events_open_uq')
      .on(t.machineId, t.code)
      .where(sql`${t.clearedAt} is null`),
  ],
);
