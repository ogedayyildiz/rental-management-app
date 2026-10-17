import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  bootstrapLogin,
  bootstrapCallback,
} from '../apps/api/dist/authentication/bootstrap-login.js';

test('bootstrap uses state, PKCE, exact loopback callback and keeps credentials in token exchange', async () => {
  const originalFetch = globalThis.fetch;
  let authorization;
  let checks;
  globalThis.fetch = async (url, options) => {
    assert.equal(url.href, 'https://bootstrap.example.test/oauth/token');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('client_secret'), 'test-only-secret');
    assert.equal(options.body.get('redirect_uri'), bootstrapCallback);
    assert.equal(options.body.get('code'), 'test-only-code');
    assert.equal(
      createHash('sha256')
        .update(options.body.get('code_verifier'))
        .digest('base64url'),
      authorization.searchParams.get('code_challenge'),
    );
    return globalThis.Response.json({ access_token: 'test-only-access-token' });
  };
  try {
    const result = await bootstrapLogin(
      {
        issuer: 'https://bootstrap.example.test/',
        audience: 'test-api',
        clientId: 'test-web',
        clientSecret: 'test-only-secret',
      },
      (url) => {
        authorization = new URL(url);
        assert.equal(
          authorization.searchParams.get('code_challenge_method'),
          'S256',
        );
        assert.equal(authorization.searchParams.get('prompt'), 'login');
        assert.ok(!url.includes('test-only-secret'));
        checks = (async () => {
          const wrong = await originalFetch(
            `${bootstrapCallback}?state=wrong&code=wrong`,
          );
          assert.equal(wrong.status, 400);
          const callback = new URL(bootstrapCallback);
          callback.searchParams.set(
            'state',
            authorization.searchParams.get('state'),
          );
          callback.searchParams.set('code', 'test-only-code');
          const valid = await originalFetch(callback);
          assert.equal(valid.status, 200);
          assert.equal(valid.headers.get('cache-control'), 'no-store');
          assert.ok(!(await valid.text()).includes('test-only-code'));
        })();
      },
    );
    await checks;
    assert.equal(result, 'test-only-access-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
