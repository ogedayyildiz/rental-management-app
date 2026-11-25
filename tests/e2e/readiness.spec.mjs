import { test, expect, json } from './fixtures.mjs';
import { URLSearchParams } from 'node:url';

test('security headers, per-request nonces, dependency readiness and bounded bridge requests', async ({
  page,
  request,
  data,
}) => {
  const response = await page.goto('/dashboard');
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  const nonce = /'nonce-([^']+)'/.exec(headers['content-security-policy'])[1];
  expect(
    await page
      .locator('script[nonce]')
      .first()
      .evaluate((el) => el.nonce),
  ).toBe(nonce);
  const again = await page.reload();
  expect(again.headers()['content-security-policy']).not.toBe(
    headers['content-security-policy'],
  );
  expect((await request.get('/ready')).status()).toBe(200);
  const ready = await request.get('http://127.0.0.1:3101/ready');
  expect(await ready.json()).toEqual({ status: 'ready', service: 'api' });
  expect(
    (
      await request.get('http://127.0.0.1:3101/me', {
        headers: { origin: 'https://untrusted.example' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await json(page, `organizations/${data.org.id}/customers`, 'POST', {
        displayName: 'x'.repeat(20000),
      })
    ).status,
  ).toBe(413);
  const forbidden = await page.request.post(
    `/api/backend/organizations/${data.org.id}/customers`,
    { headers: { origin: 'https://untrusted.example' }, data: {} },
  );
  expect(forbidden.status()).toBe(403);
});

test('bounded operational read smoke and response-time diagnostics', async ({
  page,
  data,
}, testInfo) => {
  await page.goto('/dashboard');
  const measurements = [];
  const history = new URLSearchParams({
    from: '2026-01-01T00:00:00Z',
    to: '2026-01-02T00:00:00Z',
    signals: 'batterySoc',
    limit: '25',
  });
  for (const suffix of [
    'customers?limit=25',
    'machines?limit=25',
    'rentals?limit=25',
    'maintenance?limit=25',
    'operations',
    'finance?preset=CUSTOM&from=2026-01-01T00%3A00%3A00Z&to=2026-02-01T00%3A00%3A00Z',
    `machines/${data.machine.id}/telemetry/history?${history}`,
  ]) {
    for (let iteration = 0; iteration < 3; iteration++) {
      const start = performance.now();
      const result = await json(page, `organizations/${data.org.id}/${suffix}`);
      expect(result.status).toBe(200);
      if (Array.isArray(result.body.items))
        expect(result.body.items.length).toBeLessThanOrEqual(25);
      if (Array.isArray(result.body))
        expect(result.body.length).toBeLessThanOrEqual(25);
      measurements.push({
        endpoint: suffix.split('?')[0],
        durationMs: Math.round(performance.now() - start),
      });
    }
  }
  await testInfo.attach('read-performance.json', {
    body: JSON.stringify(measurements, null, 2),
    contentType: 'application/json',
  });
});
