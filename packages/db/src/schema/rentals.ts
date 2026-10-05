import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, organizationId, point, updatedAt } from './_common.js';
import { contractStatus, inspectionType, paymentStatus, rateType } from './enums.js';
import { machines } from './fleet.js';
import { files } from './system.js';
import { users } from './tenancy.js';

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

export const customers = pgTable('customers', {
  id: id(),
  organizationId: organizationId(),
  companyName: text('company_name').notNull(),
  taxNo: text('tax_no'),
  address: text('address'),
  /** [{ name, phone, email, role }] */
  contacts: jsonb('contacts').notNull().default([]),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rentalContracts = pgTable(
  'rental_contracts',
  {
    id: id(),
    organizationId: organizationId(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    contractNo: text('contract_no').notNull(),
    status: contractStatus('status').notNull().default('draft'),
    startDate: date('start_date').notNull(),
    plannedEndDate: date('planned_end_date'),
    actualEndDate: date('actual_end_date'),
    siteAddress: text('site_address'),
    siteLocation: point('site_location'),
    terms: text('terms'),
    totalAmount: money('total_amount'),
    documentFileId: uuid('document_file_id').references(() => files.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('rental_contracts_org_no_uq').on(t.organizationId, t.contractNo)],
);

/**
 * A machine on a contract. Lines of an offer are not yet `confirmed`; once the
 * customer accepts, they are, and an exclusion constraint (custom migration)
 * stops the same machine being booked on two overlapping confirmed lines.
 */
export const rentalItems = pgTable(
  'rental_items',
  {
    id: id(),
    organizationId: organizationId(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => rentalContracts.id, { onDelete: 'cascade' }),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id),
    rateType: rateType('rate_type').notNull(),
    rate: money('rate').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    /** Null while the machine is still out */
    endAt: timestamp('end_at', { withTimezone: true }),
    startEngineHours: doublePrecision('start_engine_hours'),
    endEngineHours: doublePrecision('end_engine_hours'),
    deliveryFee: money('delivery_fee').notNull().default('0'),
    /** Agreed amount for this line; drives revenue-per-machine reporting */
    amount: money('amount'),
    /** True once the contract is confirmed; only confirmed lines block the calendar */
    confirmed: boolean('confirmed').notNull().default(false),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('rental_items_machine_idx').on(t.machineId, t.startAt),
    check('rental_items_period_ck', sql`${t.endAt} is null or ${t.endAt} > ${t.startAt}`),
  ],
);

/** Payments are tracked here; invoicing is a separate module (out of scope). */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    organizationId: organizationId(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => rentalContracts.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    dueDate: date('due_date'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    method: text('method'),
    status: paymentStatus('status').notNull().default('expected'),
    reference: text('reference'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('payments_contract_idx').on(t.contractId)],
);

/** Condition report when a machine leaves for, or returns from, a rental. */
export const inspections = pgTable('inspections', {
  id: id(),
  organizationId: organizationId(),
  rentalItemId: uuid('rental_item_id')
    .notNull()
    .references(() => rentalItems.id, { onDelete: 'cascade' }),
  type: inspectionType('type').notNull(),
  performedAt: timestamp('performed_at', { withTimezone: true }).notNull(),
  engineHours: doublePrecision('engine_hours'),
  batterySoc: doublePrecision('battery_soc'),
  fuelLevel: doublePrecision('fuel_level'),
  damageNotes: text('damage_notes'),
  photoFileIds: uuid('photo_file_ids').array().notNull().default(sql`'{}'::uuid[]`),
  signedByName: text('signed_by_name'),
  performedBy: uuid('performed_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});
