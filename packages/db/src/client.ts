import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10 });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, client };
}

/**
 * Runs `fn` in a transaction scoped to one organization. Row-level security
 * policies read `app.current_org`, so queries inside only see that tenant's rows
 * even if a WHERE clause is forgotten. Requires a role without BYPASSRLS.
 */
export function withTenant<T>(
  db: Database,
  organizationId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_org', ${organizationId}, true)`);
    return fn(tx);
  });
}
