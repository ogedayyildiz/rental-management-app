import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { openSync, closeSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const run = 'rental-stage-test-' + randomBytes(6).toString('hex');
const scratch = resolve('.e2e', run);
await mkdir(scratch, { recursive: true });
const images = ['api', 'web', 'worker', 'telemetry', 'migrator'];
const tag = process.env.DEPLOYMENT_TEST_TAG ?? 'readiness';
if (!/^[a-zA-Z0-9_.-]+$/.test(tag)) throw Error('Invalid image tag');
const proxyImage =
  'nginx:1.30.8-alpine@sha256:6437a63b5c529f0e06162b3f593c0154cff6fa2ea0f94fd7c27928cb399e022d';
const nodeImage =
  'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20';
const containers = [];
const docker = (args, env = {}, options = {}) =>
  execFileSync('docker', args, {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });
const start = (name, image, env = {}, args = [], command = []) => {
  containers.push(name);
  docker(
    [
      'run',
      '-d',
      '--name',
      name,
      '--network',
      run,
      ...Object.keys(env).flatMap((key) => ['-e', key]),
      ...args,
      image,
      ...command,
    ],
    env,
  );
};
const password = randomBytes(32).toString('hex');
const runtimePassword = randomBytes(32).toString('hex');
const deploymentId = randomUUID();
const common = {
  NODE_ENV: 'production',
  DEPLOYMENT_ENV: 'staging',
  DEPLOYMENT_ID: deploymentId,
};
const migration = {
  ...common,
  DATABASE_URL: `postgresql://owner:${password}@postgres/stage_check`,
  DATABASE_NAME: 'stage_check',
  RUNTIME_DATABASE_USER: 'runtime_app',
  RUNTIME_DATABASE_PASSWORD: runtimePassword,
  INITIALIZE_DATABASE: '1',
};
const psql = (
  query,
  database = 'stage_check',
  user = 'owner',
  secret = password,
) =>
  docker(
    [
      'exec',
      '-e',
      'PGPASSWORD',
      run + '-db',
      'psql',
      '-h',
      '127.0.0.1',
      '-U',
      user,
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-c',
      query,
    ],
    { PGPASSWORD: secret },
  );
const isolatedFlags = [
  '--read-only',
  '--tmpfs',
  '/tmp:rw,size=64m',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges:true',
];
const checked = [];
let browser;
try {
  docker(
    [
      'compose',
      '--env-file',
      'infrastructure/deployment/.env.example',
      '-f',
      'infrastructure/deployment/compose.yaml',
      'config',
      '--no-env-resolution',
      '--quiet',
    ],
    {
      DEPLOYMENT_NAME: 'rental-config-test',
      PUBLIC_HOST: 'staging.example.test',
      IMAGE_TAG: tag,
    },
  );
  checked.push(
    'production Compose validates without reading local secret files',
  );
  if (!process.argv.includes('--no-build'))
    for (const image of images) {
      console.info(`Building ${image}`);
      const log = openSync(resolve(scratch, `build-${image}.log`), 'w');
      const result = spawnSync(
        'docker',
        [
          'build',
          '-f',
          'infrastructure/deployment/Dockerfile',
          '--target',
          image,
          '-t',
          `rental/${image}:${tag}`,
          '.',
        ],
        {
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', log, log],
          timeout: 1800000,
        },
      );
      closeSync(log);
      assert.equal(result.status, 0, `Build failed: ${image}`);
    }
  docker(['network', 'create', '--internal', run]);
  // Match Compose: only the edge also joins a publishable network. Database stays private.
  docker(['network', 'create', run + '-edge']);
  const gitOpenSSL = 'C:/Program Files/Git/usr/bin/openssl.exe';
  const openssl =
    process.platform === 'win32' && existsSync(gitOpenSSL)
      ? gitOpenSSL
      : 'openssl';
  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-keyout',
      resolve(scratch, 'privkey.pem'),
      '-out',
      resolve(scratch, 'fullchain.pem'),
      '-subj',
      '/CN=oidc.test',
      '-addext',
      'subjectAltName=DNS:oidc.test,IP:127.0.0.1',
    ],
    { stdio: 'pipe', windowsHide: true },
  );
  // Private key is synthetic and short-lived. Non-root containers need read access to this test fixture only.
  docker([
    'run',
    '--rm',
    '-v',
    `${scratch}:/certs`,
    '--entrypoint',
    'chmod',
    proxyImage,
    '644',
    '/certs/privkey.pem',
  ]);
  start(
    run + '-oidc',
    nodeImage,
    {},
    [
      '--network-alias',
      'oidc.test',
      '-v',
      `${scratch}:/certs:ro`,
      '-v',
      `${resolve('tests/deployment/oidc.mjs')}:/oidc.mjs:ro`,
    ],
    ['node', '/oidc.mjs'],
  );
  start(
    run + '-db',
    'timescale/timescaledb:2.30.0-pg17',
    {
      POSTGRES_USER: 'owner',
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: 'stage_check',
    },
    ['--network-alias', 'postgres'],
  );
  for (let i = 0; ; i++) {
    try {
      psql('SELECT 1');
      break;
    } catch {
      if (i > 60) throw Error('Database unavailable');
      await delay(1000);
    }
  }
  start(run + '-redis', 'redis:8.2.2-alpine');
  assert.match(docker(['exec', run + '-redis', 'redis-cli', 'ping']), /PONG/);
  const migrate = () =>
    docker(
      [
        'run',
        '--rm',
        '--network',
        run,
        ...Object.keys(migration).flatMap((key) => ['-e', key]),
        ...isolatedFlags,
        `rental/migrator:${tag}`,
      ],
      migration,
    );
  migrate();
  migrate();
  checked.push('explicit migrations and idempotent system-only seed');
  assert.equal(psql('SELECT count(*) FROM "User"').trim(), '0');
  assert.equal(psql('SELECT count(*) FROM "Organization"').trim(), '0');
  assert.throws(() =>
    psql(
      'UPDATE "AuditEvent" SET action = action',
      'stage_check',
      'runtime_app',
      runtimePassword,
    ),
  );
  assert.throws(() =>
    psql(
      'TRUNCATE "AuditEvent"',
      'stage_check',
      'runtime_app',
      runtimePassword,
    ),
  );
  assert.throws(() =>
    psql(
      'UPDATE "DeploymentIdentity" SET environment = \'production\'',
      'stage_check',
      'runtime_app',
      runtimePassword,
    ),
  );
  assert.throws(() =>
    psql(
      'ALTER TABLE "AuditEvent" DISABLE TRIGGER ALL',
      'stage_check',
      'runtime_app',
      runtimePassword,
    ),
  );
  checked.push(
    'runtime role cannot change audit, disable triggers, or rebind environment',
  );
  const listener = createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const origin = `https://127.0.0.1:${port}`;
  const api = {
    ...common,
    HOST: '0.0.0.0',
    DATABASE_URL: `postgresql://runtime_app:${runtimePassword}@postgres/stage_check`,
    DATABASE_NAME: 'stage_check',
    APP_BASE_URL: origin,
    AUTH0_ISSUER: 'https://oidc.test/',
    AUTH0_AUDIENCE: 'stage-test-api',
    AUTH0_ALLOWED_CLIENT_IDS: 'stage-test-web',
  };
  const web = {
    ...common,
    APP_BASE_URL: origin,
    API_BASE_URL: 'http://api:3001',
    AUTH0_DOMAIN: 'oidc.test',
    AUTH0_CLIENT_ID: 'stage-test-web',
    AUTH0_CLIENT_SECRET: randomBytes(32).toString('hex'),
    AUTH0_SECRET: randomBytes(32).toString('hex'),
    AUTH0_AUDIENCE: 'stage-test-api',
    NODE_EXTRA_CA_CERTS: '/certs/fullchain.pem',
  };
  start(run + '-api', `rental/api:${tag}`, api, [
    '--network-alias',
    'api',
    ...isolatedFlags,
  ]);
  start(run + '-web', `rental/web:${tag}`, web, [
    '--network-alias',
    'web',
    '-v',
    `${scratch}:/certs:ro`,
    ...isolatedFlags,
  ]);
  for (const image of ['worker', 'telemetry'])
    start(run + '-' + image, `rental/${image}:${tag}`, common, isolatedFlags);
  start(
    run + '-proxy',
    proxyImage,
    { PUBLIC_HOST: '127.0.0.1', NGINX_ENVSUBST_OUTPUT_DIR: '/tmp' },
    [
      '--network',
      run + '-edge',
      '--user',
      '101:101',
      '-p',
      `127.0.0.1:${port}:8443`,
      '-v',
      `${scratch}:/etc/nginx/certificates:ro`,
      '-v',
      `${resolve('infrastructure/deployment/nginx.conf.template')}:/etc/nginx/templates/nginx.conf.template:ro`,
      ...isolatedFlags,
    ],
    ['nginx', '-c', '/tmp/nginx.conf', '-g', 'daemon off;'],
  );
  browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true }); // Only this disposable self-signed stack.
  for (let i = 0; ; i++) {
    try {
      const ready = await context.request.get(origin + '/ready');
      if (ready.status() === 200) break;
    } catch {
      /* waiting for process readiness */
    }
    if (i > 90) throw Error('Deployment readiness timed out');
    await delay(1000);
  }
  checked.push(
    'read-only non-root Web/API/worker/telemetry startup and private Redis',
  );
  for (const image of ['web', 'api', 'worker', 'telemetry']) {
    docker([
      'exec',
      run + '-' + image,
      'node',
      '-e',
      `const fs=require('node:fs');
      if(process.getuid()===0)process.exit(1);
      for(const path of ['/app/.env','/app/.env.local','/app/.git','/app/tests','/app/apps/web/.env.local'])if(fs.existsSync(path))process.exit(1);`,
    ]);
  }
  docker([
    'exec',
    run + '-web',
    'node',
    '-e',
    `const fs=require('node:fs'),path=require('node:path');
    function scan(dir, client){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);
      if(entry.isDirectory())scan(file,client);else if(file.endsWith('.js')){const source=fs.readFileSync(file,'utf8');
        if(source.includes('rental_e2e_session')||source.includes('TENANT_ADMIN_ALL_BRANCHES'))process.exit(1);
        if(client&&(source.includes(process.env.AUTH0_SECRET)||source.includes(process.env.AUTH0_CLIENT_SECRET)))process.exit(1);
      }}}
    scan('/app/apps/web/.next/server',false);scan('/app/apps/web/.next/static',true);`,
  ]);
  checked.push(
    'production artifacts contain no application test harness, env files or client-bundled secrets',
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.name));
  const document = await page.goto(origin + '/dashboard');
  assert.equal(document.status(), 200);
  assert.match(document.headers()['content-security-policy'], /nonce-/);
  assert.doesNotMatch(
    document.headers()['content-security-policy'],
    /unsafe-eval/,
  );
  assert.equal(
    document.headers()['strict-transport-security'],
    'max-age=31536000',
  );
  await page.waitForLoadState('networkidle');
  assert.deepEqual(errors, []);
  assert.equal(
    (await context.request.get(origin + '/api/backend/me')).status(),
    401,
  );
  for (const endpoint of ['/dev-login', '/impersonate'])
    assert.equal((await context.request.get(origin + endpoint)).status(), 404);
  await context.addCookies([
    {
      name: 'rental_e2e_session',
      value: randomBytes(32).toString('hex'),
      url: origin,
    },
  ]);
  assert.equal(
    (
      await context.request.get(origin + '/api/backend/me', {
        headers: { 'x-e2e-user': 'TENANT_ADMIN_ALL_BRANCHES' },
      })
    ).status(),
    401,
  );
  const login = await context.request.get(origin + '/auth/login', {
    maxRedirects: 0,
  });
  assert.equal(login.status(), 307);
  const authorization = new URL(login.headers().location);
  assert.equal(authorization.origin, 'https://oidc.test');
  assert.equal(
    authorization.searchParams.get('redirect_uri'),
    origin + '/auth/callback',
  );
  assert.equal(authorization.searchParams.get('audience'), 'stage-test-api');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  const transactionCookies = login
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie');
  assert.ok(transactionCookies.length > 0);
  for (const cookie of transactionCookies) {
    assert.match(cookie.value, /httponly/i);
    assert.match(cookie.value, /secure/i);
    assert.match(cookie.value, /samesite=lax/i);
    assert.doesNotMatch(cookie.value, /domain=/i);
  }
  checked.push(
    'production CSP, static assets, secure Auth0 transaction cookies and synthetic discovery redirect; no real login claimed',
  );
  await page.screenshot({
    path: resolve(scratch, 'production-web.png'),
    fullPage: true,
  });
  let limited = false;
  for (let i = 0; i < 20; i++) {
    const response = await context.request.post(
      origin + '/api/backend/invitations/accept',
      { headers: { origin }, data: {} },
    );
    if (response.status() === 429) {
      limited = true;
      break;
    }
  }
  assert.ok(limited);
  checked.push('edge invitation rate limiting');
  for (const [name, extra] of [
    ['wrong-environment', { DEPLOYMENT_ID: randomUUID() }],
    ['owner-account', { DATABASE_URL: migration.DATABASE_URL }],
    ['test-injection', { RENTAL_E2E_RUN: 'not-allowed' }],
    ['development-mode', { DEPLOYMENT_ENV: 'development' }],
    ['test-mode', { NODE_ENV: 'test', DEPLOYMENT_ENV: 'test' }],
  ]) {
    const rejected = { ...api, ...extra };
    const rejectedName = run + '-' + name;
    containers.push(rejectedName);
    assert.throws(
      () =>
        docker(
          [
            'run',
            '--rm',
            '--name',
            rejectedName,
            '--network',
            run,
            ...Object.keys(rejected).flatMap((key) => ['-e', key]),
            `rental/api:${tag}`,
          ],
          rejected,
          { timeout: 20000 },
        ),
      (error) => error.status === 1 && !error.signal,
      `Unsafe startup accepted or hung: ${name}`,
    );
  }
  checked.push(
    'wrong database identity, owner credentials and E2E switches fail closed',
  );
  // Include immutable audit data and a synthetic hypertable in an actual logical restore drill.
  psql(`INSERT INTO "AuditEvent" (id,"actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata)
    VALUES ('${randomUUID()}', 'SYSTEM', 'restore-drill', 'RESTORE_TEST', 'System', 'synthetic', 'SUCCESS', 'test', '${randomUUID()}', '{}');
    CREATE TABLE restore_probe (recorded timestamptz NOT NULL, value numeric NOT NULL);
    SELECT create_hypertable('restore_probe', 'recorded'); INSERT INTO restore_probe VALUES (now(), 12.5);`);
  docker(
    [
      'exec',
      '-e',
      'PGPASSWORD',
      run + '-db',
      'pg_dump',
      '-h',
      '127.0.0.1',
      '-U',
      'owner',
      '-d',
      'stage_check',
      '-Fc',
      '-f',
      '/tmp/restore.dump',
    ],
    { PGPASSWORD: password },
  );
  psql('CREATE DATABASE restore_check', 'postgres');
  psql(
    'CREATE EXTENSION IF NOT EXISTS timescaledb; SELECT timescaledb_pre_restore();',
    'restore_check',
  );
  docker(
    [
      'exec',
      '-e',
      'PGPASSWORD',
      run + '-db',
      'pg_restore',
      '-h',
      '127.0.0.1',
      '-U',
      'owner',
      '-d',
      'restore_check',
      '--exit-on-error',
      '/tmp/restore.dump',
    ],
    { PGPASSWORD: password },
  );
  psql('SELECT timescaledb_post_restore()', 'restore_check');
  assert.equal(
    psql(
      'SELECT count(*) FROM "AuditEvent" WHERE action = \'RESTORE_TEST\'',
      'restore_check',
    ).trim(),
    '1',
  );
  assert.equal(
    psql('SELECT value FROM restore_probe', 'restore_check').trim(),
    '12.5',
  );
  assert.equal(
    psql(
      "SELECT count(*) FROM timescaledb_information.hypertables WHERE hypertable_name IN ('restore_probe', 'telemetry_measurement')",
      'restore_check',
    ).trim(),
    '2',
  );
  assert.throws(() => psql('DELETE FROM "AuditEvent"', 'restore_check'));
  checked.push(
    'actual PostgreSQL/TimescaleDB restore, hypertable data and append-only audit trigger',
  );
  docker(['stop', '--time', '30', run + '-db']);
  assert.equal((await context.request.get(origin + '/ready')).status(), 503);
  assert.equal((await context.request.get(origin + '/health')).status(), 200);
  checked.push('dependency failure distinguishes readiness from liveness');
} catch (error) {
  // Docker exceptions can contain complete child-process output. Never echo that object.
  console.error(
    JSON.stringify({
      event: 'deployment_verification_failed',
      step: checked.at(-1) ?? 'build',
      location:
        error instanceof Error
          ? error.stack
              ?.split('\n')
              .find((line) => line.includes('verify.mjs:'))
              ?.trim()
          : undefined,
      error:
        error instanceof assert.AssertionError
          ? 'Assertion failed; inspect the named verification stage'
          : 'See sanitized diagnostics',
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const name of containers) {
    try {
      const captured = spawnSync('docker', ['logs', name], {
        encoding: 'utf8',
        windowsHide: true,
      });
      let log = (captured.stdout ?? '') + (captured.stderr ?? '');
      for (const secret of [password, runtimePassword])
        log = log.replaceAll(secret, '[redacted]');
      await writeFile(resolve(scratch, name + '.log'), log);
      const state = docker(['inspect', '--format', '{{json .State}}', name]);
      await writeFile(resolve(scratch, name + '-state.json'), state);
    } catch {
      /* container may not have started */
    }
  }
  for (const name of containers.reverse()) {
    try {
      docker(['rm', '-fv', name]);
    } catch {
      /* own disposable container only */
    }
  }
  for (const network of [run, run + '-edge'])
    try {
      docker(['network', 'rm', network]);
    } catch {
      /* absent */
    }
  await rm(resolve(scratch, 'privkey.pem'), { force: true });
  await rm(resolve(scratch, 'fullchain.pem'), { force: true });
  await writeFile(
    resolve(scratch, 'verification.json'),
    JSON.stringify({ checked, success: !process.exitCode }, null, 2),
  );
  console.info(
    JSON.stringify({
      checked,
      artifactDirectory: scratch,
      success: !process.exitCode,
    }),
  );
}
