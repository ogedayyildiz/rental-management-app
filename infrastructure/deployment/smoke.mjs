// Read-only post-deployment smoke. No credentials, account automation, or mutations.
import assert from 'node:assert/strict';
async function verify() {
  const origin = new URL(process.env.STAGING_ORIGIN ?? '');
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error('STAGING_ORIGIN must be an HTTPS origin');
  const issuer = new URL(process.env.AUTH0_ISSUER ?? '');
  if (issuer.protocol !== 'https:' || issuer.pathname !== '/')
    throw Error('Invalid issuer');
  const get = (path) =>
    fetch(new URL(path, origin), {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
  for (const path of ['/health', '/ready', '/dashboard'])
    assert.equal((await get(path)).status, 200, `Unavailable: ${path}`);
  assert.equal((await get('/api/backend/me')).status, 401);
  for (const path of ['/dev-login', '/impersonate'])
    assert.equal((await get(path)).status, 404);
  const login = await get('/auth/login');
  assert.ok([302, 307].includes(login.status));
  const location = new URL(login.headers.get('location'));
  assert.equal(location.origin, issuer.origin);
  assert.equal(
    location.searchParams.get('redirect_uri'),
    new URL('/auth/callback', origin).href,
  );
  assert.equal(
    location.searchParams.get('audience'),
    process.env.AUTH0_AUDIENCE,
  );
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const cookies = login.headers.getSetCookie();
  assert.ok(cookies.length > 0, 'Auth0 transaction cookie missing');
  for (const cookie of cookies) {
    assert.match(cookie, /secure/i);
    assert.match(cookie, /httponly/i);
    assert.match(cookie, /samesite=lax/i);
  }
  const page = await get('/dashboard');
  assert.ok(page.headers.get('strict-transport-security'));
  assert.match(page.headers.get('content-security-policy'), /nonce-/);
  const html = await page.text();
  const asset = /src="([^" ]*\/_next\/static\/[^" ]+\.js)"/.exec(html)?.[1];
  assert.ok(asset, 'Static JS asset missing');
  assert.equal((await get(asset)).status, 200);
  console.info('{"event":"staging_smoke_passed","realLoginVerified":false}');
}
// Assertion errors may contain Auth0 transaction cookies or configured URL credentials.
// Keep the post-deployment log useful without serializing those values.
void verify().catch(() => {
  console.error('{"event":"staging_smoke_failed","realLoginVerified":false}');
  process.exitCode = 1;
});
