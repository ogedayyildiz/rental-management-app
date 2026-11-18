import { test, expect, json } from './fixtures.mjs';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const requireApi = createRequire(
  new URL('../../apps/api/package.json', import.meta.url),
);
const period =
  'preset=CUSTOM&from=2026-01-01T00%3A00%3A00Z&to=2026-02-01T00%3A00%3A00Z';
async function january(page) {
  await expect(
    page.getByRole('button', { name: 'Apply filters', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('combobox', { name: 'Reporting period', exact: true })
    .selectOption('CUSTOM');
  await page.getByLabel('From (UTC)', { exact: true }).fill('2026-01-01T00:00');
  await page.getByLabel('To (UTC)', { exact: true }).fill('2026-02-01T00:00');
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Apply filters', exact: true }),
  ).toBeEnabled();
}
const financePath = (data) => `organizations/${data.org.id}/finance`;
async function workbook(download) {
  const Excel = requireApi('exceljs'),
    book = new Excel.Workbook();
  await book.xlsx.load(await readFile(await download.path()));
  return book;
}
test('finance dashboard, exact totals, period slicing, rankings, currencies and export', async ({
  page,
  data,
}, info) => {
  await page.goto('/finance');
  await january(page);
  const known = page.getByRole('row').filter({ hasText: 'FIN-KNOWN' });
  await expect(known).toContainText('600 TRY');
  await expect(known).toContainText('100 TRY');
  await expect(known).toContainText('500 TRY');
  await known
    .getByText('Lifetime through report generation', { exact: true })
    .click();
  await expect(known).toContainText('50%');
  for (const name of ['FIN-ZERO', 'FIN-UNKNOWN', 'FIN-MIXED']) {
    const row = page.getByRole('row').filter({ hasText: name });
    await row
      .getByText('Lifetime through report generation', { exact: true })
      .click();
    await expect(row).toContainText('Unavailable');
  }
  await expect(
    page.getByRole('row').filter({ hasText: 'FIN-MIXED' }),
  ).toContainText('Mixed currencies');
  await page
    .getByRole('combobox', { name: 'Rank by', exact: true })
    .selectOption('COMPLETED_VALUE');
  await page
    .getByRole('combobox', { name: 'Ranking currency', exact: true })
    .selectOption('TRY');
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect(page.getByRole('row').nth(1)).toContainText('FIN-KNOWN');
  const r = await json(
    page,
    financePath(data) +
      '?' +
      period +
      '&machineId=' +
      data.finance.machines[0].id,
  );
  expect(r.status).toBe(200);
  expect(r.body.summary.utilization.rentedSeconds).toBe(86400);
  expect(r.body.summary.utilization.observationSeconds).toBe(31 * 86400);
  const response = await page.request.get(
    '/api/backend/' + financePath(data) + '/export?' + period,
  );
  expect(response.headers()['content-type']).toContain('spreadsheetml');
  expect((await response.body()).length).toBeGreaterThan(2000);
  const pending = page.waitForEvent('download');
  await page
    .getByRole('link', { name: 'Download XLSX (current page)', exact: true })
    .click();
  const download = await pending;
  await download.saveAs(info.outputPath('finance-estimates.xlsx'));
  const book = await workbook(download);
  expect(
    book
      .getWorksheet('Performance')
      .getSheetValues()
      .flat()
      .filter((v) => v === 'FIN-KNOWN · Finance Analytics Lift'),
  ).toHaveLength(1);
  expect(
    JSON.stringify(book.getWorksheet('Performance').getSheetValues()),
  ).toContain('600');
  await page.getByLabel('To (UTC)', { exact: true }).fill('2026-01-01T12:00');
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect(known).toContainText('300 TRY');
  await page.screenshot({
    path: info.outputPath('finance-dashboard.png'),
    fullPage: true,
  });
});
test('customer grouping and Machine/Customer performance integration use the same read model', async ({
  page,
  data,
}) => {
  await page.goto('/finance');
  await january(page);
  await page
    .getByRole('combobox', { name: 'Group by', exact: true })
    .selectOption('customer');
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  const customer = page
    .getByRole('row')
    .filter({ hasText: 'Finance Example Customer' });
  await expect(customer).toContainText('900 TRY');
  await expect(customer).not.toContainText('Recorded maintenance cost');
  await page.goto(
    `/machines/${data.finance.machines[0].id}?organizationId=${data.org.id}`,
  );
  await expect(
    page.getByRole('heading', { name: 'Finance / Performance', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'View full analysis', exact: true }),
  ).toBeVisible();
  await page.goto('/customers');
  await page
    .getByLabel('Search name, identifier, contact, phone or email')
    .fill('Finance Example Customer');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .getByRole('button', { name: 'Finance Example Customer', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Finance / Performance', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'View full analysis', exact: true })
    .click();
  await january(page);
  await expect(
    page.getByRole('row').filter({ hasText: 'Finance Example Customer' }),
  ).toContainText('900 TRY');
});
test.describe('finance operational persona', () => {
  test.use({ persona: 'TENANT_NO_FINANCE' });
  test('UI, API, rankings and XLSX cannot leak restricted or derived financial values', async ({
    page,
    data,
  }) => {
    await page.goto('/finance');
    await january(page);
    await expect(
      page.getByRole('row').filter({ hasText: 'FIN-KNOWN' }),
    ).toBeVisible();
    for (const label of [
      'Estimated Completed Rental Value',
      'Recorded maintenance cost',
      'Fleet acquisition cost baseline',
      'Estimated acquisition recovery',
    ])
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    const r = await json(page, financePath(data) + '?' + period);
    expect(r.status).toBe(200);
    for (const row of [r.body.summary, ...r.body.items]) {
      expect(row.values).toEqual([]);
      expect(row).not.toHaveProperty('acquisitionCost');
      if (row.lifetime) expect(row.lifetime).not.toHaveProperty('recovery');
    }
    expect(
      (
        await json(
          page,
          financePath(data) +
            '?' +
            period +
            '&sort=COMPLETED_VALUE&sortCurrency=TRY',
        )
      ).status,
    ).toBe(403);
    const pending = page.waitForEvent('download');
    await page
      .getByRole('link', { name: 'Download XLSX (current page)', exact: true })
      .click();
    const book = await workbook(await pending),
      contents = JSON.stringify(book.worksheets.map((s) => s.getSheetValues()));
    for (const forbidden of [
      'Estimated Completed Rental Value',
      'Recorded maintenance cost',
      'Fleet acquisition cost baseline',
      'Estimated contribution before unmodeled costs',
      '87654.123',
    ])
      expect(contents).not.toContain(forbidden);
  });
});
test.describe('finance selected branch', () => {
  test.use({ persona: 'TENANT_LIMITED' });
  test('branch filters and direct IDs cannot widen analytics or export access', async ({
    page,
    data,
  }) => {
    await page.goto('/finance');
    await january(page);
    await expect(
      page.getByRole('row').filter({ hasText: 'E2E-SOUTH' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('row').filter({ hasText: 'FIN-KNOWN' }),
    ).toBeVisible();
    expect(
      (
        await json(
          page,
          financePath(data) + '?' + period + '&branchId=' + data.south.id,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await json(
          page,
          financePath(data) +
            '?' +
            period +
            '&machineId=' +
            data.otherBranch.id,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await page.request.get(
          '/api/backend/' + financePath(data) + '/export?' + period,
        )
      ).status(),
    ).toBe(403);
  });
});
for (const persona of ['SECOND_TENANT_ADMIN', 'PLATFORM_OPERATOR'])
  test.describe('finance isolation ' + persona, () => {
    test.use({ persona });
    test('tenant data and exports are denied', async ({ page, data }) => {
      await page.goto('/finance');
      expect((await json(page, financePath(data) + '?' + period)).status).toBe(
        403,
      );
      expect(
        (
          await page.request.get(
            '/api/backend/' + financePath(data) + '/export?' + period,
          )
        ).status(),
      ).toBe(403);
      await expect(
        page.getByRole('row').filter({ hasText: 'FIN-KNOWN' }),
      ).toHaveCount(0);
      if (persona === 'PLATFORM_OPERATOR')
        await expect(
          page.getByText('No authorized finance workspace.', { exact: true }),
        ).toBeVisible();
      else
        await expect(
          page.getByText('No matching records.', { exact: true }),
        ).toBeVisible();
    });
  });
