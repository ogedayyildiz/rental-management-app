import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, organizationId, point, polygon, updatedAt } from './_common.js';
import { geofenceType, machineStatus } from './enums.js';

export const depots = pgTable('depots', {
  id: id(),
  organizationId: organizationId(),
  name: text('name').notNull(),
  address: text('address'),
  location: point('location'),
  createdAt: createdAt(),
});

export const machineModels = pgTable('machine_models', {
  id: id(),
  organizationId: organizationId(),
  manufacturer: text('manufacturer').notNull(),
  model: text('model').notNull(),
  /** e.g. scissor_lift, excavator, generator */
  category: text('category').notNull(),
  specs: jsonb('specs').notNull().default({}),
  createdAt: createdAt(),
});

export const machines = pgTable(
  'machines',
  {
    id: id(),
    organizationId: organizationId(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => machineModels.id),
    /** Fleet number / display name */
    name: text('name').notNull(),
    serialNo: text('serial_no').notNull(),
    year: integer('year'),
    purchaseDate: date('purchase_date'),
    purchasePrice: numeric('purchase_price', { precision: 14, scale: 2 }),
    homeDepotId: uuid('home_depot_id').references(() => depots.id, { onDelete: 'set null' }),
    status: machineStatus('status').notNull().default('available'),
    /** Hour meter reading when the GPS device was installed, added to device-reported hours. */
    engineHoursOffset: doublePrecision('engine_hours_offset').notNull().default(0),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('machines_org_serial_uq').on(t.organizationId, t.serialNo)],
);

export const gpsDevices = pgTable(
  'gps_devices',
  {
    id: id(),
    organizationId: organizationId(),
    /** Adapter id, e.g. "simulator" or the hardware vendor's name */
    provider: text('provider').notNull(),
    /** Device id as the provider reports it (IMEI, serial, ...) */
    externalId: text('external_id').notNull(),
    machineId: uuid('machine_id').references(() => machines.id, { onDelete: 'set null' }),
    installedAt: timestamp('installed_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    // Ingestion resolves devices across all tenants, so the key is global.
    uniqueIndex('gps_devices_provider_external_uq').on(t.provider, t.externalId),
    uniqueIndex('gps_devices_active_machine_uq')
      .on(t.machineId)
      .where(sql`${t.active} and ${t.machineId} is not null`),
  ],
);

/** One row per machine with the latest telemetry, so live views never scan history. */
export const machineState = pgTable(
'machine_state',
{
  machineId: uuid('machine_id')
    .primaryKey()
    .references(() => machines.id, { onDelete: 'cascade' }),
  organizationId: organizationId(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  location: point('location'),
  speedKmh: doublePrecision('speed_kmh'),
  heading: doublePrecision('heading'),
  batterySoc: doublePrecision('battery_soc'),
  engineHours: doublePrecision('engine_hours'),
  ignition: boolean('ignition'),
  activeErrorCodes: text('active_error_codes').array().notNull().default(sql`'{}'::text[]`),
},
(t) => [index('machine_state_org_idx').on(t.organizationId)],
);

export const geofences = pgTable(
  'geofences',
  {
    id: id(),
    organizationId: organizationId(),
    name: text('name').notNull(),
    type: geofenceType('type').notNull(),
    area: polygon('area').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('geofences_area_gix').using('gist', t.area)],
);
