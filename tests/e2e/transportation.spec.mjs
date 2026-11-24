import { test, expect, json } from './fixtures.mjs';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const requireApi = createRequire(
  new URL('../../apps/api/package.json', import.meta.url),
);
const planned = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 16);
const end = new Date(Date.now() + 62 * 86400000).toISOString().slice(0, 16);
const notes = 'E2E combined transportation quote';
async function report(page) {
  await page.goto('/finance');
  await page
    .getByRole('combobox', { name: 'Reporting period', exact: true })
    .selectOption('CUSTOM');
  await page.getByLabel('From (UTC)', { exact: true }).fill(planned);
  await page.getByLabel('To (UTC)', { exact: true }).fill(end);
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Apply filters', exact: true }),
  ).toBeEnabled();
  return page.getByRole('region', { name: 'Transportation', exact: true });
}
test('transportation quote: real rental form, VAT margin, revision, finance export, reservation freeze and cancellation', async ({
  page,
  data,
}, info) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/rentals');
  await page
    .getByRole('button', { name: 'Create rental', exact: true })
    .click();
  const form = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Create rental', exact: true }),
  });
  await form
    .getByRole('button', { name: 'Find customers', exact: true })
    .click();
  await form
    .getByRole('combobox', { name: 'Customer', exact: true })
    .selectOption(data.customer.id);
  await form
    .getByRole('combobox', { name: 'Responsible branch', exact: true })
    .selectOption(data.north.id);
  await form.getByLabel('Notes', { exact: true }).fill(notes);
  await form.getByLabel('Planned start (UTC)').fill(planned);
  await form.getByLabel('Planned end (UTC)').fill(end);
  await form.getByLabel('Agreed rate', { exact: true }).fill('100');
  await form
    .getByRole('combobox', { name: 'VAT treatment', exact: true })
    .selectOption('EXCLUSIVE');
  await form.getByLabel('VAT rate (%)', { exact: true }).fill('0');
  await form
    .getByRole('combobox', { name: 'Rate unit', exact: true })
    .selectOption('DAILY');
  await form
    .getByRole('combobox', { name: 'Currency', exact: true })
    .selectOption('TRY');
  await form
    .getByRole('button', { name: 'Find available machines', exact: true })
    .click();
  await form
    .getByRole('checkbox', { name: new RegExp(data.machine.fleetNumber) })
    .check();
  await form
    .getByRole('checkbox', {
      name: 'Include transportation in the offer',
      exact: true,
    })
    .check();
  const transport = form.getByRole('group', {
    name: 'Transportation',
    exact: true,
  });
  const customer = transport.getByRole('group', {
    name: 'Transport price offered to customer',
    exact: true,
  });
  const supplier = transport.getByRole('group', {
    name: 'Transport supplier quote',
    exact: true,
  });
  await customer
    .getByLabel('Transport price offered to customer', { exact: true })
    .fill('1200');
  await customer
    .getByRole('combobox', { name: 'VAT treatment', exact: true })
    .selectOption('INCLUSIVE');
  await customer.getByLabel('VAT rate (%)', { exact: true }).fill('20');
  await supplier
    .getByLabel('Transport company / reference (optional)', { exact: true })
    .fill('E2E Transport Co');
  await supplier
    .getByLabel('Transport supplier cost', { exact: true })
    .fill('800');
  await supplier
    .getByRole('combobox', { name: 'VAT treatment', exact: true })
    .selectOption('EXCLUSIVE');
  await supplier.getByLabel('VAT rate (%)', { exact: true }).fill('10');
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Transportation', exact: true }),
  ).toContainText('200.00');
  let rental = (
    await json(page, `organizations/${data.org.id}/rentals`)
  ).body.items.find((r) => r.notes === notes);
  expect(rental.transportation.estimatedMargin).toBe('200.00');
  const url = `/rentals/${rental.id}?organizationId=${data.org.id}`;
  await page.goto(url);
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page
    .getByLabel('Transport price offered to customer', { exact: true })
    .fill('1440');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Transportation', exact: true }),
  ).toContainText('400.00');
  await page.getByText('Previous transport quotes', { exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Transportation', exact: true }),
  ).toContainText('1200.00');
  rental = (
    await json(page, `organizations/${data.org.id}/rentals/${rental.id}`)
  ).body;
  expect(rental.transportationHistory).toHaveLength(1);
  await page
    .getByRole('button', { name: 'Confirm reservation', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await json(page, `organizations/${data.org.id}/rentals/${rental.id}`))
          .body.status,
    )
    .toBe('RESERVED');
  await expect(
    page.getByRole('button', { name: 'Edit draft', exact: true }),
  ).toHaveCount(0);
  const finance = await report(page);
  await expect(finance).toContainText('Reserved');
  await expect(finance).toContainText('400.00');
  await expect(finance).toContainText('1200.00');
  await expect(finance).toContainText('800.00');
  const pending = page.waitForEvent('download');
  await page
    .getByRole('link', { name: 'Download XLSX (current page)', exact: true })
    .click();
  const download = await pending,
    Excel = requireApi('exceljs'),
    book = new Excel.Workbook();
  await book.xlsx.load(await readFile(await download.path()));
  const values = book.getWorksheet('Transportation').getSheetValues().flat();
  expect(values).toContain('400.00');
  expect(values).toContain('800.00');
  await page.screenshot({
    path: info.outputPath('transport-finance.png'),
    fullPage: true,
  });
  await page.goto(url);
  await page
    .getByLabel('Reason', { exact: true })
    .fill('E2E transport cancellation');
  await page
    .getByRole('button', { name: 'Cancel rental', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await json(page, `organizations/${data.org.id}/rentals/${rental.id}`))
          .body.status,
    )
    .toBe('CANCELLED');
  await expect(await report(page)).toContainText(
    'No included transportation quotes',
  );
});

test.describe('transportation financial denial', () => {
  test.use({ persona: 'TENANT_NO_FINANCE' });
  test('supplier costs, customer prices and inferred margin remain absent from UI and API', async ({
    page,
    data,
  }) => {
    await page.goto('/rentals');
    const rows = await json(page, `organizations/${data.org.id}/rentals`);
    const rental = rows.body.items.find(
      (r) => r.id === data.financialRental.id,
    );
    expect(rental).toBeTruthy();
    for (const q of [rental.transportation, ...rental.transportationHistory])
      for (const key of [
        'currency',
        'customerPrice',
        'customerTax',
        'supplierQuote',
        'estimatedMargin',
      ])
        expect(q).not.toHaveProperty(key);
    await page.goto(`/rentals/${rental.id}?organizationId=${data.org.id}`);
    await expect(
      page.getByRole('region', { name: 'Transportation', exact: true }),
    ).not.toContainText('800.00');
    await page.goto('/finance');
    await expect(
      page.getByRole('region', { name: 'Transportation', exact: true }),
    ).toHaveCount(0);
    const denied = await json(
      page,
      `organizations/${data.org.id}/rentals`,
      'POST',
      {
        customerId: data.customer.id,
        branchId: data.north.id,
        transportation: {
          currency: 'TRY',
          customerPrice: '10',
          customerTax: { mode: 'EXCLUSIVE', rate: '0' },
        },
      },
    );
    expect(denied.status).toBe(403);
  });
});
