import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, organizationId } from './_common.js';
import { users } from './tenancy.js';

export const files = pgTable('files', {
  id: id(),
  organizationId: organizationId(),
  storageKey: text('storage_key').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const alertRules = pgTable('alert_rules', {
  id: id(),
  organizationId: organizationId(),
  /** low_soc | error_severity | geofence_exit | maintenance_due | rental_overdue | offline */
  type: text('type').notNull(),
  params: jsonb('params').notNull().default({}),
  /** { userIds: [], roles: [], emails: [] } */
  recipients: jsonb('recipients').notNull().default({}),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    organizationId: organizationId(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id'),
    diff: jsonb('diff'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId)],
);
