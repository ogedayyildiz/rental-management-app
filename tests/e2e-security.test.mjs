import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { assertE2E, identityFor } from './e2e/isolation.mjs';
import { Auth0IdentityVerifier } from '../apps/api/dist/authentication/auth0.verifier.js';
const run = 'a'.repeat(32);
const identities = Object.fromEntries(
  ['A', 'B', 'C', 'D', 'E'].map((x) => [
    x,
    { token: randomBytes(32).toString('hex') },
  ]),
);
const valid = {
  NODE_ENV: 'test',
  RENTAL_E2E_RUN: run,
  DATABASE_URL: `postgresql://test:test@127.0.0.1/rental_e2e_${run}`,
  APP_BASE_URL: 'http://127.0.0.1:3100',
  API_BASE_URL: 'http://127.0.0.1:3101',
  RENTAL_E2E_IDENTITIES: JSON.stringify(identities),
};
test('E2E identity injection fails closed outside isolated process', () => {
  assertE2E(valid);
  for (const change of [
    { NODE_ENV: 'production' },
    { NODE_ENV: 'development', RENTAL_E2E_RUN: undefined },
    { DATABASE_URL: 'postgresql://test:test@127.0.0.1/rental' },
    { APP_BASE_URL: 'http://127.0.0.1:3000' },
    { RENTAL_E2E_IDENTITIES: '{}' },
  ])
    assert.throws(() => assertE2E({ ...valid, ...change }));
  assert.equal(identityFor(valid, 'TENANT_ADMIN_ALL_BRANCHES'), null);
  assert.equal(identityFor(valid, 'email@example.test'), null);
});
test('normal authentication rejects ephemeral E2E credentials; production sources have no test switch', async () => {
  const verifier = new Auth0IdentityVerifier({
    issuer: 'https://e2e.invalid/',
    audience: 'test',
    clientIds: ['test'],
  });
  assert.equal(await verifier.verify(identities.A.token), null);
  for (const file of [
    'apps/web/lib/auth0.ts',
    'apps/web/proxy.ts',
    'apps/api/src/foundation.module.ts',
  ]) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /RENTAL_E2E|rental_e2e_session|e2e\/|dev-login|impersonate/,
    );
  }
});
