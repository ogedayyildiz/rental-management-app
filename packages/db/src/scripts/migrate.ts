import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { createDb } from '../client.js';

const url = process.env.DATABASE_URL_ADMIN;
if (!url) throw new Error('DATABASE_URL_ADMIN is not set (see .env.example)');

const { db, client } = createDb(url, { max: 1 });
const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url));

await migrate(db, { migrationsFolder });
console.log('Migrations applied.');
await client.end();
