import { test, expect, json } from './fixtures.mjs';
test('no impersonation endpoint or unsigned identity header/cookie', async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await context.setExtraHTTPHeaders({
    'x-e2e-user': 'TENANT_ADMIN_ALL_BRANCHES',
  });
  await context.addCookies([
    {
      name: 'rental_e2e_session',
      value: 'TENANT_ADMIN_ALL_BRANCHES',
      url: 'http://127.0.0.1:3100',
    },
  ]);
  await page.goto('/');
  expect((await json(page, 'me')).status).toBe(401);
  for (const path of ['/dev-login', '/impersonate', '/auth/login'])
    expect((await page.request.get(path)).status()).toBe(404);
});
test('ordinary production API ignores all E2E switches, credentials, cookies and headers', async ({
  request,
}) => {
  const token = JSON.parse(process.env.RENTAL_E2E_IDENTITIES)
    .TENANT_ADMIN_ALL_BRANCHES.token;
  for (const headers of [
    { authorization: `Bearer ${token}` },
    { cookie: `rental_e2e_session=${token}` },
    { 'x-e2e-user': 'TENANT_ADMIN_ALL_BRANCHES' },
  ]) {
    const response = await request.get('http://127.0.0.1:3102/me', { headers });
    expect(response.status()).toBe(401);
  }
});
test.describe('financial omission across real UI and bridge', () => {
  test.use({ persona: 'TENANT_NO_FINANCE' });
  test('rental and maintenance amounts stay omitted', async ({
    page,
    data,
  }) => {
    await page.goto('/rentals');
    const rentals = (await json(page, `organizations/${data.org.id}/rentals`))
      .body.items;
    for (const row of rentals) {
      const detail = (
        await json(page, `organizations/${data.org.id}/rentals/${row.id}`)
      ).body;
      for (const item of detail.items) {
        expect(item).not.toHaveProperty('agreedRate');
        expect(item).not.toHaveProperty('tax');
        expect(item).not.toHaveProperty('terms');
      }
    }
    await page
      .getByRole('button', { name: 'Create rental', exact: true })
      .click();
    await expect(page.getByLabel('Agreed rate', { exact: true })).toHaveCount(
      0,
    );
    await page.goto('/maintenance');
    const orders = (
      await json(page, `organizations/${data.org.id}/maintenance`)
    ).body.items;
    expect(orders.length).toBeGreaterThan(0);
    for (const row of orders) expect(row).not.toHaveProperty('costs');
    await page
      .getByRole('link', { name: orders[0].number, exact: true })
      .click();
    await expect(page.getByLabel('Amount', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Costs', exact: true }),
    ).toHaveCount(0);
  });
});
