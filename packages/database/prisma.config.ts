import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generation does not require a database; migration commands require DATABASE_URL.
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
