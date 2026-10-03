import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './tenancy.js';

export const id = () => uuid('id').primaryKey().defaultRandom();

/** Tenant key. Every business table has it; row-level security filters on it. */
export const organizationId = () =>
  uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export { point, polygon, type LonLat } from './postgis.js';
