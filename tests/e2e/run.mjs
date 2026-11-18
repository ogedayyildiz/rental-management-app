import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  mkdir,
  cp,
  copyFile,
  symlink,
  writeFile,
  readFile,
  rm,
  open,
} from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createDatabase } from '../../packages/database/dist/index.js';
import { seed } from './builders.mjs';
const root = resolve(import.meta.dirname, '../..'),
  scratch = resolve(root, '.e2e');
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const dbRequire = createRequire(
  resolve(root, 'packages/database/package.json'),
);
const local = new URL(process.env.DATABASE_URL ?? '');
if (
  process.env.NODE_ENV === 'production' ||
  !['127.0.0.1', 'localhost'].includes(local.hostname)
)
  throw Error('E2E requires local PostgreSQL, never production');
local.hostname = '127.0.0.1';
// Connect to the PostgreSQL administrative database; never reset the development database.
local.pathname = '/postgres';
const admin = createDatabase(local.href);
const children = [];
let dbName, db, lock;
let cleanupPromise;
async function drop(name) {
  if (!/^rental_e2e_[a-f0-9]{32}$/.test(name))
    throw Error('Unsafe database name');
  await admin.$executeRawUnsafe(
    `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
  );
}
function cleanup() {
  cleanupPromise ??= cleanupOnce();
  return cleanupPromise;
}
async function cleanupOnce() {
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } catch {
        /* Process may already have exited; health polling retries startup. */
      }
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* Process may already have exited; health polling retries startup. */
      }
    }
  }
  await db?.$disconnect();
  if (dbName) await drop(dbName);
  await admin.$disconnect();
  if (lock) {
    await lock.close();
    await rm(resolve(scratch, 'run.lock'), { force: true });
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(130));
  });
function start(file, args, env, cwd = root, log = false) {
  const child = spawn(process.execPath, [file, ...args], {
    env,
    cwd,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: log ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  if (!log) {
    // Test servers receive only synthetic credentials. Keep server diagnostics separately.
    child.stdout.on('data', (d) =>
      writeFile(resolve(scratch, 'servers.log'), d, { flag: 'a' }),
    );
    child.stderr.on('data', (d) =>
      writeFile(resolve(scratch, 'servers.log'), d, { flag: 'a' }),
    );
  }
  return child;
}
async function wait(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw Error(
        `E2E server for ${url} exited (${child.exitCode ?? child.signalCode}); inspect .e2e/servers.log`,
      );
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).ok) return;
    } catch {
      /* Process may already have exited; health polling retries startup. */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error('E2E server health timeout; inspect .e2e/servers.log');
}
try {
  await mkdir(scratch, { recursive: true });
  lock = await open(resolve(scratch, 'run.lock'), 'wx');
  if (process.argv.includes('--cleanup')) {
    const state = JSON.parse(
      await readFile(resolve(scratch, 'state.json'), 'utf8'),
    );
    await drop(state.databaseName);
  } else {
    // Never attach to unknown processes on the E2E ports.
    const { createServer } = await import('node:net');
    for (const port of [3100, 3101, 3102])
      await new Promise((res, rej) => {
        const s = createServer();
        s.once('error', rej);
        s.listen(port, '127.0.0.1', () => s.close(res));
      });
    const run = randomBytes(16).toString('hex');
    dbName = `rental_e2e_${run}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    local.pathname = '/' + dbName;
    const identities = Object.fromEntries(
      [
        'PLATFORM_OPERATOR',
        'TENANT_ADMIN_ALL_BRANCHES',
        'TENANT_LIMITED',
        'TENANT_NO_FINANCE',
        'SECOND_TENANT_ADMIN',
        'MANAGED_MEMBER',
        'TENANT_MULTI_ORG',
      ].map((name) => [name, { token: randomBytes(32).toString('hex') }]),
    );
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      TELEMETRY_FRESH_SECONDS: '8',
      DATABASE_URL: local.href,
      RENTAL_E2E_RUN: run,
      RENTAL_E2E_IDENTITIES: JSON.stringify(identities),
      APP_BASE_URL: 'http://127.0.0.1:3100',
      API_BASE_URL: 'http://127.0.0.1:3101',
      AUTH0_DOMAIN: 'e2e.invalid',
      AUTH0_CLIENT_ID: 'unused-test-client',
      AUTH0_CLIENT_SECRET: randomBytes(32).toString('hex'),
      AUTH0_SECRET: randomBytes(32).toString('hex'),
      AUTH0_AUDIENCE: 'https://e2e.invalid/api',
      AUTH0_ISSUER: 'https://e2e.invalid/',
      AUTH0_ALLOWED_CLIENT_IDS: 'unused-test-client',
    };
    execFileSync(
      process.execPath,
      [dbRequire.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: resolve(root, 'packages/database'),
        env,
        stdio: 'pipe',
        windowsHide: true,
      },
    );
    db = createDatabase(local.href);
    const data = await seed(db, env);
    // Credentials stay in child-process environment; manifest has only synthetic record IDs.
    await writeFile(
      resolve(scratch, 'state.json'),
      JSON.stringify({ ...data, databaseName: dbName }),
    );
    await writeFile(resolve(scratch, 'servers.log'), '');
    const copy = resolve(scratch, 'web');
    // Fixed path resolved under scratch; never follow external paths when removing.
    if (!copy.startsWith(scratch + (process.platform === 'win32' ? '\\' : '/')))
      throw Error('Unsafe workspace');
    await rm(copy, { recursive: true, force: true });
    await cp(resolve(root, 'apps/web'), copy, {
      recursive: true,
      filter: (source) =>
        !['node_modules', '.next', 'dist'].includes(basename(source)) &&
        !basename(source).startsWith('.env') &&
        !source.endsWith('.tsbuildinfo'),
    });
    await symlink(
      resolve(root, 'apps/web/node_modules'),
      resolve(copy, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await copyFile(
      resolve(root, 'tests/e2e/session.ts'),
      resolve(copy, 'lib/auth0.ts'),
    );
    execFileSync(process.execPath, [resolve(copy, 'scripts/map-assets.mjs')], {
      cwd: copy,
      windowsHide: true,
    });
    await copyFile(
      resolve(root, 'tests/e2e/isolation.mjs'),
      resolve(copy, 'lib/e2e-isolation.mjs'),
    );
    // Next resolves symlinked dependencies from the repository root.
    await writeFile(
      resolve(copy, 'next.config.ts'),
      (
        await readFile(resolve(root, 'apps/web/next.config.ts'), 'utf8')
      ).replace(
        'const config: NextConfig = {',
        `const config: NextConfig = { turbopack: { root: ${JSON.stringify(root)} },`,
      ),
    );
    const api = start(resolve(root, 'tests/e2e/api.mjs'), [], env);
    await wait(env.API_BASE_URL + '/health', api);
    const productionApi = start(resolve(root, 'apps/api/dist/main.js'), [], {
      ...env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      API_PORT: '3102',
    });
    await wait('http://127.0.0.1:3102/health', productionApi);
    const web = start(
      webRequire.resolve('next/dist/bin/next'),
      ['dev', '--hostname', '127.0.0.1', '--port', '3100'],
      { ...env, NODE_ENV: 'development' },
      copy,
    );
    await wait(env.APP_BASE_URL, web);
    const test = start(
      resolve(root, 'node_modules/@playwright/test/cli.js'),
      [
        'test',
        '--config',
        resolve(root, 'tests/e2e/playwright.config.mjs'),
        ...process.argv.slice(2),
      ],
      env,
      root,
      true,
    );
    process.exitCode = await new Promise((r) =>
      test.on('exit', (code) => r(code ?? 1)),
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'E2E failed');
  process.exitCode = 1;
} finally {
  await cleanup();
}
