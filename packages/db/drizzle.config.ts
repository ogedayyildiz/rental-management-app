import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  // Timescale/PostGIS internals live in their own schemas; only manage ours.
  schemaFilter: ['public'],
  extensionsFilters: ['postgis'],
});
