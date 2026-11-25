import { test, expect, json } from './fixtures.mjs';
import { createDatabase } from '../../packages/database/dist/index.js';
import {
  fixtureAdapter,
  ingest,
  simulatedFrame,
} from '../../apps/telemetry/dist/ingestion.js';
import { assertE2E } from './isolation.mjs';
test('device administration, simulator measurements, faults, source selection and historical movement', async ({
  page,
  data,
}) => {
  test.setTimeout(120000);
  await page.goto('/devices');
  await page.getByLabel('Provider', { exact: true }).fill('simulator');
  await page.getByLabel('External device identifier').fill('primary');
  await page.getByRole('button', { name: 'Register device' }).click();
  await page.getByLabel('Target machine').selectOption(data.machine.id);
  await page.getByRole('button', { name: 'Install device' }).click();
  await expect(
    page
      .getByText('E2E-NORTH', { exact: false })
      .filter({ hasNot: page.locator('option') })
      .last(),
  ).toBeVisible();
  const base = 'organizations/' + data.org.id,
    devs = base + '/devices';
  const primary = (await json(page, devs)).body.find(
    (d) => d.providerDeviceId === 'primary',
  );
  const second = (
    await json(page, devs, 'POST', {
      provider: 'simulator',
      providerDeviceId: 'battery',
      priorities: { batterySoc: 90 },
    })
  ).body;
  expect(
    (
      await json(page, devs + '/' + second.id + '/install', 'POST', {
        machineId: data.machine.id,
      })
    ).status,
  ).toBe(201);
  await page.goto(
    '/machines/' + data.machine.id + '?organizationId=' + data.org.id,
  );
  const panel = page.getByRole('region', { name: 'Telemetry', exact: true });
  await expect(panel).toBeVisible();
  assertE2E(process.env);
  const db = createDatabase(process.env.DATABASE_URL);
  const emit = (key, frame) =>
    ingest(
      db,
      { organizationId: data.org.id, provider: 'simulator', externalId: key },
      fixtureAdapter('simulator'),
      frame,
    );
  const refresh = () =>
    panel.getByRole('button', { name: 'Refresh telemetry' }).click();
  try {
    const first = simulatedFrame(0, new Date());
    await emit('primary', first);
    await refresh();
    await expect(panel.getByText('Online', { exact: true })).toBeVisible();
    await expect(panel.getByText(/41, 29 ·/)).toBeVisible();
    await expect(
      panel.getByRole('img', { name: 'Last known position' }),
    ).toHaveAttribute('data-map-ready', 'true');
    await expect(panel.getByText(/80 ·/)).toBeVisible();
    await expect(panel.getByText(/100 ·/)).toBeVisible();
    await expect(panel.getByText(/SIM_DRIVE/)).toBeVisible();
    await panel.getByRole('button', { name: 'Measurement history' }).click();
    await expect(
      panel.getByRole('list', { name: 'Measurement history' }),
    ).toContainText('41, 29');
    const preferred = simulatedFrame(1, new Date());
    preferred.signals = { batterySoc: 61 };
    delete preferred.fault;
    await emit('battery', preferred);
    const clear = simulatedFrame(2, new Date());
    await emit('primary', clear);
    await refresh();
    await expect(panel.getByText(/61 ·/)).toBeVisible();
    await expect(panel.getByText(/102 ·/)).toBeVisible();
    await expect(panel.getByText(/SIM_DRIVE/)).toHaveCount(0);
    // The E2E API has a short deterministic freshness interval; normal production default is unchanged.
    await expect(async () => {
      await refresh();
      await expect(panel.getByText('Offline', { exact: true })).toBeVisible({
        timeout: 800,
      });
    }).toPass({ timeout: 30000 });
    await expect(panel.getByText(/Last known/).first()).toBeVisible();
  } finally {
    await db.$disconnect();
  }
  await page.goto('/devices');
  await page.getByRole('button', { name: 'simulator · primary' }).click();
  await page.getByLabel('Target machine').selectOption(data.otherBranch.id);
  await page.getByRole('button', { name: 'Move device' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'E2E-SOUTH ·' }),
  ).toContainText('Installed');
  const detail = (await json(page, devs + '/' + primary.id)).body;
  expect(detail.installations).toHaveLength(2);
  expect(detail.installations[1].removedAt).toBe(
    detail.installations[0].installedAt,
  );
  await page.getByRole('button', { name: 'Remove installation' }).click();
  await expect(
    page.getByRole('heading', { name: 'Installation history' }),
  ).toHaveCount(0);
});
test.describe('limited telemetry user', () => {
  test.use({ persona: 'TENANT_LIMITED' });
  test('branch and tenant joins constrain telemetry and device management', async ({
    page,
    data,
  }) => {
    await page.goto('/devices');
    await expect(
      page.getByRole('heading', { name: 'Tracking devices' }),
    ).toBeVisible();
    const base = 'organizations/' + data.org.id;
    expect(
      (await json(page, base + '/devices/' + data.hiddenDevice.id)).status,
    ).toBe(404);
    expect(
      (await json(page, base + '/devices/' + data.foreignDevice.id)).status,
    ).toBe(404);
    expect(
      (await json(page, base + '/machines/' + data.machine.id + '/telemetry'))
        .status,
    ).toBe(200);
    expect(
      (
        await json(
          page,
          base + '/machines/' + data.otherBranch.id + '/telemetry',
        )
      ).status,
    ).toBe(404);
    expect(
      (await json(page, 'organizations/' + data.second.id + '/devices')).status,
    ).toBe(403);
    expect(
      (
        await json(page, base + '/devices', 'POST', {
          provider: 'simulator',
          providerDeviceId: 'denied',
        })
      ).status,
    ).toBe(403);
    await expect(
      page.getByRole('button', { name: 'Register device' }),
    ).toHaveCount(0);
  });
});
