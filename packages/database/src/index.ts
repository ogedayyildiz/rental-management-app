import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrlSchema } from '@rental/validation';
import { PrismaClient } from './generated/prisma/client.js';

export { PrismaClient, Prisma } from './generated/prisma/client.js';

export function createDatabase(connectionString: unknown): PrismaClient {
  const parsed = databaseUrlSchema.safeParse(connectionString);
  if (!parsed.success) throw new Error('Invalid database configuration');
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: parsed.data,
      connectionTimeoutMillis: 5000,
    }),
    // Query parameters can contain identity data or credentials; never log queries.
    log: [],
  });
}
