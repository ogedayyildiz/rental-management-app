import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { assertE2E } from './isolation.mjs';
export { expect };
export const test = base.extend({
  persona: ['TENANT_ADMIN_ALL_BRANCHES', { option: true }],
  data: async ({ persona }, use) =>
    use({ ...JSON.parse(await readFile('.e2e/state.json', 'utf8')), persona }),
  page: async ({ page, context, persona }, use) => {
    const identities = assertE2E(process.env);
    await context.addCookies([
      {
        name: 'rental_e2e_session',
        value: identities[persona].token,
        url: 'http://127.0.0.1:3100',
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
    await use(page);
  },
});
export async function json(page, path, method = 'GET', body) {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch('/api/backend/' + path, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    },
    { path, method, body },
  );
}
