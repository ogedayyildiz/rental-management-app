import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import {
  ExportCapacityInterceptor,
  ReadinessController,
} from '../apps/api/dist/operations.http.js';
import { boundedBody, securityHeaders } from '../apps/web/lib/web-security.ts';
const require = createRequire(import.meta.url);
const apiRequire = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { Subject, firstValueFrom, of } = apiRequire('rxjs');
const {
  validateDeployment,
  validateWebEnvironment,
} = require('../packages/config/dist/index.js');
const env = {
  NODE_ENV: 'production',
  DEPLOYMENT_ENV: 'staging',
  DEPLOYMENT_ID: randomUUID(),
  APP_BASE_URL: 'https://staging.example.test',
  API_BASE_URL: 'http://api:3001',
  AUTH0_DOMAIN: 'identity.example.test',
  AUTH0_CLIENT_ID: 'synthetic-client',
  AUTH0_CLIENT_SECRET: randomBytes(32).toString('hex'),
  AUTH0_SECRET: randomBytes(32).toString('hex'),
  AUTH0_AUDIENCE: 'synthetic-audience',
  DATABASE_NAME: 'staging_test',
  DATABASE_URL: 'postgresql://runtime:synthetic@postgres/staging_test',
};

test('deployment guards reject mixed environments and test switches without disclosing values', () => {
  validateDeployment(env, 'api');
  validateWebEnvironment(env);
  for (const changes of [
    { NODE_ENV: 'test' },
    { RENTAL_E2E_RUN: 'secret-input' },
    { DATABASE_NAME: 'production' },
    {
      DATABASE_URL:
        'postgresql://runtime:secret-input@remote.example/staging_test',
    },
    { DEPLOYMENT_ID: 'secret-input' },
  ]) {
    assert.throws(
      () => validateDeployment({ ...env, ...changes }, 'api'),
      (e) => !e.message.includes('secret-input'),
    );
  }
  validateDeployment(
    {
      ...env,
      DATABASE_URL:
        'postgresql://runtime:synthetic@remote.example/staging_test?sslmode=verify-full',
    },
    'api',
  );
});
test('production web requires HTTPS, strict origins, secret and host-only cookie scope', () => {
  for (const changes of [
    { APP_BASE_URL: 'http://127.0.0.1:3000' },
    { API_BASE_URL: 'http://evil.example' },
    { APP_BASE_URL: 'https://staging.example.test/path' },
    { AUTH0_COOKIE_DOMAIN: '.example.test' },
    { AUTH0_COOKIE_PATH: '/other' },
    { AUTH0_SECRET: '0'.repeat(64) },
    { AUTH0_SECRET: 'short' },
  ])
    assert.throws(() => validateWebEnvironment({ ...env, ...changes }));
  validateWebEnvironment({
    ...env,
    NODE_ENV: 'development',
    DEPLOYMENT_ENV: 'development',
    APP_BASE_URL: 'http://127.0.0.1:3000',
    API_BASE_URL: 'http://127.0.0.1:3001',
  });
});
test('CSP restricts scripts with nonces, permits local map workers and enables HSTS only on HTTPS production', () => {
  const headers = securityHeaders('random-test-nonce', true, true);
  assert.match(headers['Content-Security-Policy'], /nonce-random-test-nonce/);
  assert.doesNotMatch(
    headers['Content-Security-Policy'].split(';')[1],
    /unsafe-/,
  );
  assert.match(headers['Content-Security-Policy'], /worker-src 'self' blob:/);
  assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
  assert.equal(
    securityHeaders('dev', false, false)['Strict-Transport-Security'],
    undefined,
  );
});
test('bridge input is bounded in bytes before the body is accumulated', async () => {
  assert.equal(
    await boundedBody(
      new Request('https://example.test', { method: 'POST', body: 'valid' }),
    ),
    'valid',
  );
  await assert.rejects(
    boundedBody(
      new Request('https://example.test', {
        method: 'POST',
        body: 'ğ'.repeat(8193),
      }),
    ),
    RangeError,
  );
  await assert.rejects(
    boundedBody(
      new Request('https://example.test', {
        method: 'POST',
        headers: { 'content-length': '999999' },
        body: '',
      }),
    ),
    RangeError,
  );
});
test('deployment images exclude private/test files and production authentication has no impersonation path', async () => {
  const ignore = await readFile('.dockerignore', 'utf8');
  for (const path of [
    '**/.env',
    '.git',
    '.e2e',
    '**/*.key',
    'infrastructure/deployment/local',
  ])
    assert.ok(ignore.includes(path));
  const entry = await readFile(
    'infrastructure/deployment/entrypoint.mjs',
    'utf8',
  );
  assert.match(entry, /RENTAL_E2E/);
  for (const path of [
    'apps/web/next.config.ts',
    'apps/web/lib/auth0.ts',
    'apps/web/app/api/backend/[...path]/route.ts',
  ]) {
    const content = await readFile(path, 'utf8');
    assert.doesNotMatch(content, /NEXT_PUBLIC_.*(?:SECRET|TOKEN|DATABASE)/);
  }
});

test('export capacity remains occupied after disconnect until report generation finishes', async () => {
  const limiter = new ExportCapacityInterceptor();
  const pending = [];
  const context = () => {
    const response = new EventEmitter();
    response.destroyed = false;
    response.setHeader = () => {};
    return {
      response,
      switchToHttp: () => ({
        getRequest: () => ({
          url: '/organizations/00000000-0000-0000-0000-000000000001/finance/export',
        }),
        getResponse: () => response,
      }),
    };
  };
  for (let i = 0; i < 4; i++) {
    const c = context(),
      result = new Subject();
    limiter.intercept(c, { handle: () => result }).subscribe();
    c.response.emit('close');
    pending.push(result);
  }
  await assert.rejects(
    firstValueFrom(
      limiter.intercept(context(), { handle: () => of('unexpected') }),
    ),
    (error) => error.getStatus() === 429,
  );
  pending.forEach((subject) => subject.complete());
  const next = context();
  assert.equal(
    await firstValueFrom(limiter.intercept(next, { handle: () => of('ok') })),
    'ok',
  );
  next.response.emit('close');
});

test('readiness dependency failures expose no database error detail', async () => {
  const controller = new ReadinessController({
    $transaction: async () => {
      throw Error('private-database-detail');
    },
  });
  await assert.rejects(
    controller.ready(),
    (error) =>
      error.getStatus() === 503 &&
      !JSON.stringify(error.getResponse()).includes('private-database-detail'),
  );
});

test('post-deployment smoke failures do not log configured credentials or assertion values', () => {
  const secret = randomBytes(32).toString('hex');
  const result = spawnSync(
    process.execPath,
    ['infrastructure/deployment/smoke.mjs'],
    {
      env: { ...process.env, STAGING_ORIGIN: `invalid-origin-${secret}` },
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr.trim(),
    '{"event":"staging_smoke_failed","realLoginVerified":false}',
  );
  assert.ok(!result.stderr.includes(secret));
});
