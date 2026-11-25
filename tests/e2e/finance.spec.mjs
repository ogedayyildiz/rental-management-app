import { expectCurrencyChoices } from './currency-helpers.mjs';
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
async function expectDuration(root, label, value) {
  await expect(
    root
      .getByText(label, { exact: true })
      .locator('..')
      .getByRole('definition'),
  ).toHaveText(value);
}
function exportedDuration(book, header) {
  const sheet = book.getWorksheet('Performance'),
    rows = sheet.getSheetValues(),
    column = sheet.getRow(1).values.indexOf(header),
    row = rows.find((r) => r?.includes('FIN-KNOWN · Finance Analytics Lift'));
  expect(column).toBeGreaterThan(0);
  expect(row).toBeTruthy();
  return row[column];
}
test('finance dashboard, exact totals, period slicing, rankings, currencies and export', async ({
  page,
  data,
}, info) => {
  await page.goto('/finance');
  await january(page);
  await expectCurrencyChoices(
    page.getByRole('combobox', { name: 'Currency', exact: true }),
  );
  const known = page.getByRole('row').filter({ hasText: 'FIN-KNOWN' });
  await expect(known).toContainText('600 TRY');
  await expect(known).toContainText('100 TRY');
  await expect(known).toContainText('500 TRY');
  const duration = page.getByRole('combobox', {
    name: 'Duration unit',
    exact: true,
  });
  await expect(duration).toHaveValue('DAYS');
  await expect(duration.getByRole('option')).toHaveText(['Hours', 'Days']);
  await expectDuration(known, 'Rented time (Days)', '1');
  await expectDuration(known, 'Observation time (Days)', '31');
  await expectDuration(known, 'Reserved time (Days)', '0');
  await expectDuration(known, 'Unrented time (Days)', '30');
  await expectDuration(known, 'Average completed rental duration (Days)', '1');
  await duration.selectOption('HOURS');
  await expectDuration(known, 'Rented time (Hours)', '24');
  await expectDuration(known, 'Observation time (Hours)', '744');
  await expectDuration(known, 'Unrented time (Hours)', '720');
  await expectDuration(
    known,
    'Average completed rental duration (Hours)',
    '24',
  );
  await expect(known).toContainText('600 TRY');
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
  await expectCurrencyChoices(
    page.getByRole('combobox', { name: 'Ranking currency', exact: true }),
  );
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
  const Excel = requireApi('exceljs'),
    daysBook = new Excel.Workbook();
  await daysBook.xlsx.load(await response.body());
  expect(exportedDuration(daysBook, 'Rented time (Days)')).toBe(1);
  const pending = page.waitForEvent('download');
  await page
    .getByRole('link', { name: 'Download XLSX (current page)', exact: true })
    .click();
  const download = await pending;
  await download.saveAs(info.outputPath('finance-estimates.xlsx'));
  const book = await workbook(download);
  expect(exportedDuration(book, 'Rented time (Hours)')).toBe(24);
  expect(
    book
      .getWorksheet('ESTIMATE_V1')
      .getSheetValues()
      .some((row) => row?.includes('HOURS')),
  ).toBe(true);
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
  await expectDuration(known, 'Rented time (Hours)', '12');
  await duration.selectOption('DAYS');
  await expectDuration(known, 'Rented time (Days)', '0.5');
  await page
    .getByRole('combobox', { name: 'Language', exact: true })
    .selectOption('tr');
  await expect(
    page.getByRole('combobox', { name: 'Süre birimi', exact: true }),
  ).toHaveValue('DAYS');
  await expectDuration(known, 'Kiralanan süre (Gün)', '0,5');
  await page
    .getByRole('combobox', { name: 'Dil', exact: true })
    .selectOption('en');
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
  await expect(
    page.getByRole('combobox', { name: 'Duration unit', exact: true }),
  ).toHaveValue('DAYS');
  await page
    .getByRole('combobox', { name: 'Duration unit', exact: true })
    .selectOption('HOURS');
  await expectDuration(page, 'Rented time (Hours)', '24');
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
  await expect(
    page.getByRole('combobox', { name: 'Duration unit', exact: true }),
  ).toHaveValue('DAYS');
  await page
    .getByRole('combobox', { name: 'Duration unit', exact: true })
    .selectOption('HOURS');
  await expect(
    page.getByText('Rented time (Hours)', { exact: true }),
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
          page.getByRole('status').filter({
            hasText:
              'You have no active organization membership. Platform access does not grant tenant access.',
          }),
        ).toBeVisible();
      else
        await expect(
          page.getByText('No matching records.', { exact: true }),
        ).toBeVisible();
    });
  });
