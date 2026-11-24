import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const pgRequire = createRequire(require.resolve('@prisma/adapter-pg'));
const { Client } = pgRequire('pg');
const { validateDeployment } = require('@rental/config');
validateDeployment(process.env, 'api');

// Run only from the migrator image, with an operator-owned credential injected at runtime.
const mode = process.env.DEPLOYMENT_ENV;
const id = process.env.DEPLOYMENT_ID;
let connection;
try {
  connection = new URL(process.env.DATABASE_URL ?? '');
} catch {
  throw Error('Invalid deployment database URL');
}
if (
  !['staging', 'production'].includes(mode) ||
  !/^[0-9a-f-]{36}$/i.test(id ?? '') ||
  !process.env.DATABASE_NAME ||
  decodeURIComponent(connection.pathname.slice(1)) !== process.env.DATABASE_NAME
)
  throw Error('Invalid deployment database configuration');
const db = new Client({
  connectionString: connection.href,
  connectionTimeoutMillis: 5000,
});
let step = 'preflight';
try {
  await db.connect();
  const exists = await db.query(
    `SELECT to_regclass('public."DeploymentIdentity"') IS NOT NULL AS present`,
  );
  if (exists.rows[0].present) {
    const binding = await db.query(
      'SELECT environment, "deploymentId" FROM "DeploymentIdentity" WHERE id = 1',
    );
    if (
      binding.rowCount !== 1 ||
      binding.rows[0].environment !== mode ||
      binding.rows[0].deploymentId !== id
    )
      throw Error('Environment binding mismatch');
  } else {
    const tables = await db.query(
      "SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys'",
    );
    if (process.env.INITIALIZE_DATABASE !== '1' || tables.rows[0].count !== 0)
      throw Error('Database is not an explicitly initialized empty deployment');
  }
  if (process.argv[2] === 'status') {
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'status'],
      { stdio: 'pipe' },
    );
    console.info(JSON.stringify({ event: 'migrations_current' }));
  } else if (process.argv[2] === 'deploy') {
    const username = process.env.RUNTIME_DATABASE_USER;
    const password = process.env.RUNTIME_DATABASE_PASSWORD;
    if (
      !/^[a-z][a-z0-9_]{2,62}$/.test(username ?? '') ||
      (password?.length ?? 0) < 32 ||
      username === decodeURIComponent(connection.username)
    )
      throw Error('Invalid runtime role configuration');
    step = 'migrations';
    // Capture CLI output: failures may contain a datasource description. Never print credentials.
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { stdio: 'pipe' },
    );
    step = 'runtime_role';
    // Persist the binding before role setup so a failed grant/seed can be retried safely.
    await db.query(
      `INSERT INTO "DeploymentIdentity" (id, environment, "deploymentId") VALUES (1, $1, $2)
      ON CONFLICT (id) DO NOTHING`,
      [mode, id],
    );
    const ident = (value) => '"' + value.replaceAll('"', '""') + '"';
    const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(7254191)');
    await db.query(
      `INSERT INTO "DeploymentIdentity" (id, environment, "deploymentId") VALUES (1, $1, $2)
      ON CONFLICT (id) DO NOTHING`,
      [mode, id],
    );
    const roles = await db.query(
      'SELECT oid FROM pg_roles WHERE rolname = $1',
      [username],
    );
    const lockedBinding = await db.query(
      'SELECT environment, "deploymentId" FROM "DeploymentIdentity" WHERE id = 1 FOR UPDATE',
    );
    if (
      lockedBinding.rows[0]?.environment !== mode ||
      lockedBinding.rows[0]?.deploymentId !== id
    )
      throw Error('Environment binding changed during deployment');
    if (roles.rowCount === 0)
      await db.query(`CREATE ROLE ${ident(username)} LOGIN`);
    else {
      const ownership = await db.query(
        `SELECT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = $1)
        OR EXISTS (SELECT 1 FROM pg_class WHERE relowner = $1)
        OR EXISTS (SELECT 1 FROM pg_database WHERE datdba = $1) AS unsafe`,
        [roles.rows[0].oid],
      );
      if (ownership.rows[0].unsafe)
        throw Error('Runtime role must not own objects or inherit roles');
    }
    await db.query(
      `ALTER ROLE ${ident(username)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${literal(password)}`,
    );
    await db.query(
      `REVOKE ALL ON DATABASE ${ident(process.env.DATABASE_NAME)} FROM PUBLIC`,
    );
    await db.query(
      `GRANT CONNECT ON DATABASE ${ident(process.env.DATABASE_NAME)} TO ${ident(username)}`,
    );
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await db.query(`REVOKE ALL ON SCHEMA public FROM ${ident(username)}`);
    await db.query(`GRANT USAGE ON SCHEMA public TO ${ident(username)}`);
    await db.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ident(username)}`,
    );
    await db.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ident(username)}`,
    );
    await db.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(username)}`,
    );
    await db.query(
      `REVOKE UPDATE, DELETE ON "AuditEvent" FROM ${ident(username)}`,
    );
    await db.query(
      `REVOKE INSERT, UPDATE, DELETE ON "DeploymentIdentity" FROM ${ident(username)}`,
    );
    await db.query(
      `REVOKE ALL ON "_prisma_migrations" FROM ${ident(username)}`,
    );
    await db.query('COMMIT');
    step = 'system_seed';
    execFileSync(process.execPath, ['dist/seed.js'], { stdio: 'pipe' });
    console.info(
      JSON.stringify({ event: 'migration_and_system_seed_complete' }),
    );
  } else throw Error('Expected deploy or status');
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  console.error(
    JSON.stringify({
      event: 'deployment_database_failed',
      step,
      code:
        typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code)
          ? error.code
          : 'OPERATION_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
