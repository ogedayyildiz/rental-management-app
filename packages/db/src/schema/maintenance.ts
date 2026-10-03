import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, organizationId } from './_common.js';
import { maintenanceType } from './enums.js';
import { machines } from './fleet.js';
import { users } from './tenancy.js';

/**
 * Recurring service for one machine. Due when either threshold is reached,
 * counted from the latest record for this plan (or from the baseline).
 */
export const maintenancePlans = pgTable(
  'maintenance_plans',
  {
    id: id(),
    organizationId: organizationId(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    intervalHours: doublePrecision('interval_hours'),
    intervalDays: integer('interval_days'),
    warnBeforeHours: doublePrecision('warn_before_hours').notNull().default(0),
    warnBeforeDays: integer('warn_before_days').notNull().default(0),
    baselineDate: date('baseline_date').notNull(),
    baselineHours: doublePrecision('baseline_hours').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'maintenance_plans_interval_ck',
      sql`${t.intervalHours} is not null or ${t.intervalDays} is not null`,
    ),
  ],
);

export const maintenanceRecords = pgTable(
  'maintenance_records',
  {
    id: id(),
    organizationId: organizationId(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => maintenancePlans.id, { onDelete: 'set null' }),
    type: maintenanceType('type').notNull(),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull(),
    engineHours: doublePrecision('engine_hours'),
    cost: numeric('cost', { precision: 14, scale: 2 }),
    technicianId: uuid('technician_id').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [index('maintenance_records_machine_idx').on(t.machineId, t.performedAt)],
);
