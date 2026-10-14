import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { Auth0IdentityVerifier } from '../apps/api/dist/authentication/auth0.verifier.js';
import { AuthenticationService } from '../apps/api/dist/access/access.service.js';
import { readAuth0Environment } from '../packages/config/dist/index.js';

const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } = await import(
  pathToFileURL(require.resolve('jose')).href
);
const { privateKey, publicKey } = await generateKeyPair('RS256');
const configuration = {
  issuer: 'https://identity.example.test/',
  audience: 'test-api',
  clientIds: ['test-web'],
};
const verifier = new Auth0IdentityVerifier(
  configuration,
  createLocalJWKSet({ keys: [await exportJWK(publicKey)] }),
);
async function token(overrides = {}, key = privateKey) {
  return new SignJWT({ azp: 'test-web', ...overrides })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(overrides.iss ?? configuration.issuer)
    .setSubject('test-user')
    .setAudience(overrides.aud ?? configuration.audience)
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? '5m')
    .sign(key);
}

test('valid JWT signature maps verified issuer and subject', async () => {
  assert.deepEqual(await verifier.verify(await token()), {
    issuer: configuration.issuer,
    subject: 'test-user',
  });
});
for (const [name, claims] of [
  ['issuer', { iss: 'https://attacker.example.test/' }],
  ['audience', { aud: 'other-api' }],
  ['expiry', { exp: 1 }],
  ['client', { azp: 'other-client' }],
  ['machine principal', { gty: 'client-credentials' }],
]) {
  test(`reject invalid ${name}`, async () =>
    assert.equal(await verifier.verify(await token(claims)), null));
}
test('reject invalid signature, unsigned and malformed credentials', async () => {
  const other = await generateKeyPair('RS256');
  assert.equal(await verifier.verify(await token({}, other.privateKey)), null);
  assert.equal(
    await verifier.verify('eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.'),
    null,
  );
  assert.equal(await verifier.verify('not-a-token'), null);
});
test('unknown verified identity cannot access ordinary authenticated endpoints', async () => {
  const service = new AuthenticationService(verifier, {
    findActiveUser: async () => null,
  });
  await assert.rejects(service.authenticate(`Bearer ${await token()}`), {
    code: 'UNAUTHENTICATED',
  });
});
test('onboarding email must be verified and bound to the JWT subject', async (context) => {
  let profile = {
    sub: 'test-user',
    email: 'invitee@example.test',
    email_verified: true,
    name: 'Invitee',
  };
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), `${configuration.issuer}userinfo`);
    return globalThis.Response.json(profile);
  });
  const credential = await token();
  assert.equal(
    (await verifier.verifyInvitationIdentity(credential)).email,
    profile.email,
  );
  profile = { ...profile, email_verified: false };
  assert.equal(await verifier.verifyInvitationIdentity(credential), null);
  profile = { ...profile, email_verified: true, sub: 'someone-else' };
  assert.equal(await verifier.verifyInvitationIdentity(credential), null);
});
test('missing or insecure Auth0 configuration fails closed without echoing values', () => {
  for (const env of [
    {},
    {
      AUTH0_ISSUER: 'http://secret.example/',
      AUTH0_AUDIENCE: 'api',
      AUTH0_ALLOWED_CLIENT_IDS: 'web',
    },
  ]) {
    assert.throws(() => readAuth0Environment(env), {
      message:
        'Invalid Auth0 configuration: AUTH0_ISSUER, AUTH0_AUDIENCE, AUTH0_ALLOWED_CLIENT_IDS',
    });
  }
});
