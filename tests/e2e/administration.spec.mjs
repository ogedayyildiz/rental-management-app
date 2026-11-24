import { expectCurrencyChoices } from './currency-helpers.mjs';
import { test, expect, json } from './fixtures.mjs';
import { assertE2E } from './isolation.mjs';
const form = (page, name) => page.getByRole('form', { name, exact: true });
const row = (page, name) => page.getByRole('row').filter({ hasText: name });
async function open(page, path) {
  await page.goto('/settings/' + path);
  await expect(
    page.getByRole('button', { name: 'Search', exact: true }),
  ).toBeEnabled();
}
async function confirm(editor) {
  await editor
    .getByLabel('Confirm this access or status change', { exact: true })
    .check();
}
async function persona(browser, name) {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'rental_e2e_session',
      value: assertE2E(process.env)[name].token,
      url: 'http://127.0.0.1:3100',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  const page = await context.newPage();
  await page.goto('/');
  return { context, page };
}
test('administration: organization settings and translated account context', async ({
  page,
  data,
}) => {
  await page.goto('/settings/organization');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'E2E Rental Company',
  );
  await expectCurrencyChoices(
    page.getByRole('combobox', { name: 'Default currency', exact: true }),
  );
  await page
    .getByLabel('Legal name', { exact: true })
    .fill('E2E Legal Company');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByLabel('Legal name', { exact: true })).toHaveValue(
    'E2E Legal Company',
  );
  await page.reload();
  await expect(page.getByLabel('Legal name', { exact: true })).toHaveValue(
    'E2E Legal Company',
  );
  await page
    .getByRole('link', { name: 'Account & context', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Account & context' }),
  ).toBeVisible();
  await expect(
    page.getByText('TENANT_ADMIN_ALL_BRANCHES ·', { exact: false }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Language', exact: true })
    .selectOption('tr');
  await expect(
    page.getByRole('heading', { name: 'Hesap ve bağlam' }),
  ).toBeVisible();
  expect(
    (await json(page, `organizations/${data.org.id}/settings`)).status,
  ).toBe(200);
});
test('administration: create operational role, assign branches, live financial redaction and membership deactivation', async ({
  page,
  browser,
  data,
}) => {
  await open(page, 'roles');
  await page.getByRole('button', { name: 'Create role', exact: true }).click();
  let editor = form(page, 'Roles & permissions');
  await editor.getByLabel('Name', { exact: true }).fill('E2E Operations');
  for (const key of [
    'customers.read',
    'machines.read',
    'rentals.read',
    'maintenance.read',
  ])
    await editor.locator(`input[value="${key}"]`).check();
  await expect(
    editor.locator('input[value="rentals.pricing.view"]'),
  ).not.toBeChecked();
  await expect(
    editor.locator('input[value="platform.organization.create"]'),
  ).toHaveCount(0);
  await editor.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(row(page, 'E2E Operations')).toBeVisible();
  await open(page, 'users');
  await row(page, 'MANAGED_MEMBER')
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  editor = form(page, 'Members');
  await editor.getByLabel('MANAGED_MEMBER', { exact: true }).uncheck();
  await editor.getByLabel('E2E Operations', { exact: true }).check();
  await editor
    .getByRole('combobox', { name: 'Branch scope', exact: true })
    .selectOption('SELECTED_BRANCHES');
  await editor.getByLabel('North', { exact: true }).check();
  await confirm(editor);
  await editor
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(row(page, 'MANAGED_MEMBER')).toContainText('Selected branches');
  const restricted = await persona(browser, 'MANAGED_MEMBER');
  try {
    const base = `organizations/${data.org.id}`;
    let result = await json(
      restricted.page,
      `${base}/machines/${data.machine.id}`,
    );
    expect(result.status).toBe(200);
    expect(result.body.acquisitionCost).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('87654.123');
    expect(
      (await json(restricted.page, `${base}/machines/${data.otherBranch.id}`))
        .status,
    ).toBe(404);
    expect(
      (
        await json(
          restricted.page,
          `${base}/rentals/${data.financialRental.id}`,
        )
      ).status,
    ).toBe(404);
    await restricted.page.goto('/machines');
    await expect(
      restricted.page.getByText('E2E-NORTH', { exact: true }),
    ).toBeVisible();
    await expect(
      restricted.page.getByText('E2E-SOUTH', { exact: true }),
    ).toHaveCount(0);
    await open(page, 'roles');
    await row(page, 'E2E Operations')
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    editor = form(page, 'Roles & permissions');
    await editor.locator('input[value="machines.read"]').uncheck();
    await confirm(editor);
    await editor
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    expect(
      (await json(restricted.page, `${base}/machines/${data.machine.id}`))
        .status,
    ).toBe(403);
    await open(page, 'users');
    await row(page, 'MANAGED_MEMBER')
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    editor = form(page, 'Members');
    await editor
      .getByRole('combobox', { name: 'Branch scope', exact: true })
      .selectOption('ALL_BRANCHES');
    await confirm(editor);
    await editor
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(row(page, 'MANAGED_MEMBER')).toContainText('All branches');
    const rentalResult = await json(
      restricted.page,
      `${base}/rentals/${data.financialRental.id}`,
    );
    expect(rentalResult.status).toBe(200);
    for (const item of rentalResult.body.items)
      expect(item).not.toHaveProperty('agreedRate');
    const serviceResult = await json(
      restricted.page,
      `${base}/maintenance/${data.financialWorkOrder.id}`,
    );
    expect(serviceResult.status).toBe(200);
    expect(serviceResult.body).not.toHaveProperty('costs');
    await row(page, 'MANAGED_MEMBER')
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    editor = form(page, 'Members');
    await editor
      .getByRole('combobox', { name: 'Status', exact: true })
      .selectOption('INACTIVE');
    await confirm(editor);
    await editor
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(row(page, 'MANAGED_MEMBER')).toContainText('Inactive');
    expect((await json(restricted.page, `${base}/customers`)).status).toBe(403);
  } finally {
    await restricted.context.close();
  }
});
test('administration: branch create, rename, deactivate preserves records; invitations created and revoked', async ({
  page,
  data,
}) => {
  await open(page, 'branches');
  await page
    .getByRole('button', { name: 'Create branch', exact: true })
    .click();
  let editor = form(page, 'Branches');
  await editor
    .getByLabel('Name', { exact: true })
    .fill('E2E Administration Branch');
  await editor.getByRole('button', { name: 'Create', exact: true }).click();
  await row(page, 'E2E Administration Branch')
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  editor = form(page, 'Branches');
  await editor.getByLabel('Name', { exact: true }).fill('E2E Closed Branch');
  await editor.getByLabel('Enabled', { exact: true }).uncheck();
  await confirm(editor);
  await editor
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(row(page, 'E2E Closed Branch')).toContainText('Inactive');
  await open(page, 'invitations');
  await page
    .getByRole('button', { name: 'Invite member', exact: true })
    .click();
  editor = form(page, 'Invitations');
  await editor
    .getByLabel('Email', { exact: true })
    .fill('admin-invite@example.test');
  await editor.getByLabel('TENANT_LIMITED', { exact: true }).check();
  await editor
    .getByRole('combobox', { name: 'Branch scope', exact: true })
    .selectOption('SELECTED_BRANCHES');
  await expect(
    editor.getByText('No branches selected: this member has no branch access.'),
  ).toBeVisible();
  await editor.getByLabel('North', { exact: true }).check();
  await expect(
    editor.getByLabel('E2E Closed Branch', { exact: true }),
  ).toHaveCount(0);
  await editor.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(row(page, 'admin-invite@example.test')).toContainText('Pending');
  const issued = await page
    .getByLabel('Invitation token (shown once)', { exact: true })
    .inputValue();
  expect(issued.length).toBe(43); // Synthetic token stays inside test memory; never attach or log it.
  const audit = await json(page, `organizations/${data.org.id}/audit`);
  expect(JSON.stringify(audit.body)).not.toContain(issued);
  const invites = await json(page, `organizations/${data.org.id}/invitations`);
  expect(JSON.stringify(invites.body)).not.toMatch(/token|hash/i);
  await page.reload();
  await expect(
    page.getByLabel('Invitation token (shown once)', { exact: true }),
  ).toHaveCount(0);
  await row(page, 'admin-invite@example.test')
    .getByRole('button', { name: 'Revoke invitation' })
    .click();
  const revoke = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Revoke invitation', exact: true }),
  });
  await confirm(revoke);
  await revoke
    .getByRole('button', { name: 'Revoke invitation', exact: true })
    .click();
  await expect(row(page, 'admin-invite@example.test')).toContainText('Revoked');
});
test('administration: lockout protection and immutable filtered audit UI', async ({
  page,
  data,
}) => {
  await open(page, 'users');
  await row(page, 'TENANT_ADMIN_ALL_BRANCHES')
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  const editor = form(page, 'Members');
  await editor
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('INACTIVE');
  await confirm(editor);
  await editor
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Keep at least one active member',
  );
  expect(
    (await json(page, `organizations/${data.org.id}/settings`)).status,
  ).toBe(200);
  await open(page, 'audit');
  await page.getByLabel('Action', { exact: true }).fill('MEMBERSHIP_CHANGED');
  await page
    .getByRole('combobox', { name: 'Domain', exact: true })
    .selectOption('ADMINISTRATION');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'MEMBERSHIP_CHANGED', exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Edit', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Delete', exact: true }),
  ).toHaveCount(0);
  const denied = await json(
    page,
    `organizations/${data.org.id}/roles`,
    'POST',
    {
      name: 'Forbidden platform role',
      permissions: ['platform.organization.create'],
    },
  );
  expect(denied.status).toBe(403);
});
test.describe('administration selected branch', () => {
  test.use({ persona: 'TENANT_LIMITED' });
  test('organization-wide administration and cross-branch data remain denied', async ({
    page,
    data,
  }) => {
    await page.goto('/settings/users');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'do not have access',
    );
    for (const path of ['roles', 'memberships', 'audit', 'settings'])
      expect(
        (await json(page, `organizations/${data.org.id}/${path}`)).status,
      ).toBe(403);
    expect(
      (
        await json(
          page,
          `organizations/${data.org.id}/machines/${data.otherBranch.id}`,
        )
      ).status,
    ).toBe(404);
  });
});
test.describe('administration platform', () => {
  test.use({ persona: 'PLATFORM_OPERATOR' });
  test('platform-only user has no tenant administration', async ({
    page,
    data,
  }) => {
    await page.goto('/settings');
    await expect(
      page.getByText('No active tenant memberships.', { exact: false }),
    ).toBeVisible();
    expect(
      (await json(page, `organizations/${data.org.id}/settings`)).status,
    ).toBe(403);
  });
});
test.describe('administration second tenant', () => {
  test.use({ persona: 'SECOND_TENANT_ADMIN' });
  test('cross-tenant identifiers and audit records cannot be accessed', async ({
    page,
    data,
  }) => {
    await page.goto('/settings');
    expect(
      (await json(page, `organizations/${data.org.id}/memberships`)).status,
    ).toBe(403);
    expect(
      (await json(page, `organizations/${data.org.id}/audit`)).status,
    ).toBe(403);
    expect(
      (
        await json(
          page,
          `organizations/${data.second.id}/branches/${data.north.id}`,
        )
      ).status,
    ).toBe(404);
  });
});
test.describe('administration multiple organizations', () => {
  test.use({ persona: 'TENANT_MULTI_ORG' });
  test('switching clears prior context and business navigation uses selected membership', async ({
    page,
    data,
  }) => {
    await page.goto(`/settings?organizationId=${data.org.id}`);
    await expect(
      page.getByRole('combobox', { name: 'Active organization', exact: true }),
    ).toHaveValue(data.org.id);
    await page
      .getByRole('combobox', { name: 'Active organization', exact: true })
      .selectOption(data.second.id);
    await expect(
      page.getByRole('combobox', { name: 'Active organization', exact: true }),
    ).toHaveValue(data.second.id);
    const link = page.getByRole('link', { name: 'Customers', exact: true });
    await expect(link).toHaveAttribute(
      'href',
      `/customers?organizationId=${data.second.id}`,
    );
    await link.click();
    await expect(
      page.getByText('E2E Active Customer', { exact: true }),
    ).toHaveCount(0);
    const response = await json(
      page,
      `organizations/${data.second.id}/customers`,
    );
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    await page.goto(`/settings/users?organizationId=${data.org.id}`);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'do not have access',
    );
  });
});
