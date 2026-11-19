import { test, expect, json } from './fixtures.mjs';
import { createDatabase } from '../../packages/database/dist/index.js';
import { assertE2E } from './isolation.mjs';
import { fixtureAdapter, ingest } from '../../apps/telemetry/dist/ingestion.js';
const endpoint = (d) => `organizations/${d.org.id}/operations`;
test('operations dashboard: scoped deadlines, telemetry attention and quick customer creation', async ({
  page,
  data,
}) => {
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Operations dashboard', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Active rentals: 2', exact: true }),
  ).toBeVisible();
  const attention = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Needs attention', exact: true }),
  });
  await expect(
    attention.getByText('Return overdue', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    attention.getByText('Work order overdue', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    attention.getByText('Telemetry offline · last known contact', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(attention.getByText(/OPS_FAULT/)).toBeVisible();
  await test.info().attach('operations-dashboard', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await page
    .getByRole('combobox', { name: 'Branch filter', exact: true })
    .selectOption(data.north.id);
  await expect(
    page.getByRole('link', { name: 'Active rentals: 1', exact: true }),
  ).toBeVisible();
  await expect(
    attention.getByRole('link', {
      name: data.operations.south.rental.number,
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Add customer', exact: true }).click();
  await page.getByLabel(/^Display name/).fill('Dashboard quick customer');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Dashboard quick customer',
      exact: true,
    }),
  ).toBeVisible();
});
test('operations notifications: acknowledge, unread, dismiss and preferences persist without resolving rental', async ({
  page,
  data,
}) => {
  await page.goto('/notifications');
  const row = page.getByTestId('attention-item').filter({
    has: page.getByRole('link', {
      name: data.operations.north.rental.number,
      exact: true,
    }),
  });
  await row.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await expect(row.getByText(/Acknowledged/)).toBeVisible();
  await row.getByRole('button', { name: 'Mark unread', exact: true }).click();
  await expect(
    row.getByRole('button', { name: 'Mark read', exact: true }),
  ).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(
    (
      await json(
        page,
        `organizations/${data.org.id}/rentals/${data.operations.north.rental.id}`,
      )
    ).body.status,
  ).toBe('ACTIVE');
  await page
    .getByLabel('Low battery display threshold (%)', { exact: true })
    .fill('25');
  await page
    .getByRole('button', { name: 'Save preferences', exact: true })
    .click();
  await expect(
    page.getByLabel('Low battery display threshold (%)', { exact: true }),
  ).toHaveValue('25');
  await page.reload();
  await expect(
    page.getByLabel('Low battery display threshold (%)', { exact: true }),
  ).toHaveValue('25');
  await expect(row).toHaveCount(0);
});
test('operations telemetry: simulator fresh SoC, explicit fault clear and stale alert', async ({
  page,
  data,
}) => {
  assertE2E(process.env);
  const db = createDatabase(process.env.DATABASE_URL);
  const emit = (frame) =>
    ingest(
      db,
      {
        organizationId: data.org.id,
        provider: 'simulator',
        externalId: data.operations.device.providerDeviceId,
      },
      fixtureAdapter('simulator'),
      frame,
    );
  try {
    await emit({
      eventId: 'operations-fresh',
      recordedAt: new Date().toISOString(),
      signals: { batterySoc: 12 },
      fault: { code: 'OPS_FAULT', active: false },
    });
    await page.goto('/dashboard');
    await expect(
      page.getByText('Low battery · advisory', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/OPS_FAULT/)).toHaveCount(0);
    const r = (await json(page, endpoint(data))).body;
    expect(r.metrics.find((v) => v.key === 'offlineMachines').value).toBe(0);
    await expect(async () => {
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(
        page.getByText('Telemetry offline · last known contact', {
          exact: true,
        }),
      ).toBeVisible({ timeout: 800 });
    }).toPass({ timeout: 30000 });
    await expect(
      page.getByText('Low battery · advisory', { exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.$disconnect();
  }
});
test('operations navigation, global search, EN/TR and responsive keyboard access', async ({
  page,
  data,
}) => {
  await page.goto('/dashboard');
  await page
    .getByRole('searchbox', { name: 'Global search', exact: true })
    .fill('OPS-NORTH');
  await page
    .getByRole('button', { name: 'Search all records', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'OPS-NORTH · Lift', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'OPS-NORTH · Operations Lift',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Machines', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page
    .getByRole('combobox', { name: 'Language', exact: true })
    .selectOption('tr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
  await page
    .getByRole('navigation', { name: 'Ana gezinme' })
    .getByRole('link', { name: 'Operasyon panosu', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Operasyon panosu', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth <=
        globalThis.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'İçeriğe geç', exact: true }).focus();

  await expect(
    page.getByRole('link', { name: 'İçeriğe geç', exact: true }),
  ).toBeFocused();
  expect((await json(page, endpoint(data))).status).toBe(200);
});
test('operations error and empty states recover without exposing exception details', async ({
  page,
}) => {
  await page.route('**/api/backend/organizations/*/operations', (r) =>
    r.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"code":"HTTP_503"}',
    }),
  );
  await page.goto('/dashboard');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Check your connection',
  );
  await page.unroute('**/api/backend/organizations/*/operations');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    page.getByRole('link', { name: /Active rentals:/ }),
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Global search', exact: true })
    .fill('nothing-matches-this-unique-query');
  await page
    .getByRole('button', { name: 'Search all records', exact: true })
    .click();
  await expect(
    page.getByText('No accessible records match this search.', { exact: true }),
  ).toBeVisible();
});
test.describe('operations branch permissions', () => {
  test.use({ persona: 'TENANT_LIMITED' });
  test('selected branches constrain totals, results and alert links', async ({
    page,
    data,
  }) => {
    await page.goto('/dashboard');
    await expect(
      page.getByRole('link', { name: 'Active rentals: 1', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Add customer', exact: true }),
    ).toHaveCount(0);
    const r = await json(page, endpoint(data));
    expect(JSON.stringify(r.body)).not.toContain(
      data.operations.south.rental.id,
    );
    expect(
      (await json(page, endpoint(data) + '?branchId=' + data.south.id)).status,
    ).toBe(403);
    expect(
      (await json(page, endpoint(data) + '/search?q=OPS-SOUTH')).body.items,
    ).toEqual([]);
    expect(
      (await json(page, `organizations/${data.second.id}/operations`)).status,
    ).toBe(403);
  });
});
test.describe('operations financial redaction', () => {
  test.use({ persona: 'TENANT_NO_FINANCE' });
  test('operational dashboard and search never contain commercial amounts', async ({
    page,
    data,
  }) => {
    await page.goto('/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Operations dashboard', exact: true }),
    ).toBeVisible();
    const r = await json(page, endpoint(data));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(
      /agreedRate|acquisitionCost|123456\.78|estimatedContractedValue/,
    );
    expect(
      (await json(page, endpoint(data) + '/search?q=OPS')).body.items.length,
    ).toBeGreaterThan(0);
  });
});
test.describe('operations platform separation', () => {
  test.use({ persona: 'PLATFORM_OPERATOR' });
  test('platform operator gets no tenant dashboard or search', async ({
    page,
    data,
  }) => {
    await page.goto('/dashboard');
    await expect(
      page.getByText(/no active organization membership/),
    ).toBeVisible();
    expect((await json(page, endpoint(data))).status).toBe(403);
    expect((await json(page, endpoint(data) + '/search?q=OPS')).status).toBe(
      403,
    );
  });
});
test.describe('operations multi-organization', () => {
  test.use({ persona: 'TENANT_MULTI_ORG' });
  test('switch refreshes scope and source permissions with no carried-over metrics', async ({
    page,
    data,
  }) => {
    await page.goto(`/dashboard?organizationId=${data.org.id}`);
    await expect(
      page.getByRole('link', { name: /Rented machines:/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Active rentals:/ }),
    ).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'Active organization', exact: true })
      .selectOption(data.second.id);
    await expect(page).toHaveURL(new RegExp(data.second.id));
    await expect(
      page.getByRole('link', { name: 'Rented machines: 0', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText('OPS-NORTH');
  });
});

test('rental inline customer creation preserves draft and restores keyboard focus', async ({
  page,
  data,
}) => {
  await page.goto('/rentals?create=1&organizationId=' + data.org.id);
  const trigger = page.getByRole('button', {
    name: 'Create new customer',
    exact: true,
  });
  await page
    .getByLabel('Notes', { exact: true })
    .fill('Preserved operational draft');
  await trigger.click();
  const panel = page.getByRole('region', {
    name: 'Create new customer',
    exact: true,
  });
  const name = panel.getByLabel(/^Display name/);
  await expect(name).toBeFocused();
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole('textbox', { name: 'Notes', exact: true }),
  ).toHaveValue('Preserved operational draft');
  await trigger.click();
  await name.fill('Inline operational customer');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(
    page
      .getByRole('combobox', { name: 'Customer', exact: true })
      .locator('option:checked'),
  ).toHaveText('Inline operational customer');
  await expect(
    page.getByRole('textbox', { name: 'Notes', exact: true }),
  ).toHaveValue('Preserved operational draft');
});

test.describe('operations telemetry-only source access', () => {
  test.use({ persona: 'TENANT_LIMITED' });
  test('telemetry alert opens canonical data without granting Machine details', async ({
    page,
    data,
  }) => {
    assertE2E(process.env);
    const db = createDatabase(process.env.DATABASE_URL);
    const role = await db.role.findFirstOrThrow({
      where: { organizationId: data.org.id, name: 'TENANT_LIMITED' },
    });
    try {
      await db.rolePermission.delete({
        where: {
          organizationId_roleId_permissionKey: {
            organizationId: data.org.id,
            roleId: role.id,
            permissionKey: 'machines.read',
          },
        },
      });
      await page.goto('/dashboard');
      const row = page
        .getByTestId('attention-item')
        .filter({ hasText: 'Telemetry offline' });
      await row.getByRole('link', { name: 'OPS-NORTH', exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(
          '/machines/' + data.operations.north.machine.id + '/telemetry',
        ),
      );
      await expect(
        page.getByRole('heading', { name: 'Telemetry', exact: true, level: 1 }),
      ).toBeVisible();
      await expect(
        page.locator('dl > div').filter({
          has: page.getByRole('term').filter({ hasText: 'Battery SoC (%)' }),
        }),
      ).toContainText('Last known');
      expect(
        (
          await json(
            page,
            'organizations/' +
              data.org.id +
              '/machines/' +
              data.operations.north.machine.id,
          )
        ).status,
      ).toBe(403);
      await expect(
        page.getByRole('button', { name: 'Edit', exact: true }),
      ).toHaveCount(0);
    } finally {
      await db.rolePermission.create({
        data: {
          organizationId: data.org.id,
          roleId: role.id,
          permissionKey: 'machines.read',
        },
      });
      await db.$disconnect();
    }
  });
});
