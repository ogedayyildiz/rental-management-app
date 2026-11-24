import { expectCurrencyChoices } from './currency-helpers.mjs';
import { test, expect, json } from './fixtures.mjs';
test('customer create, search, edit and archive through forms', async ({
  page,
}) => {
  await page.goto('/customers');
  await page
    .getByRole('button', { name: 'Create customer', exact: true })
    .click();
  await page.getByLabel(/^Display name/).fill('Browser Customer');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Browser Customer', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel(/^Display name/).fill('Browser Customer Corrected');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Back to customers' }).click();
  await page
    .getByLabel('Search name, identifier, contact, phone or email')
    .fill('Browser Customer Corrected');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .getByRole('button', { name: 'Browser Customer Corrected', exact: true })
    .click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(
    page.getByText('This customer is inactive.', { exact: false }),
  ).toBeVisible();
});
test('machine create, search, edit and retire through forms', async ({
  page,
  data,
}) => {
  await page.goto('/machines');
  await page.getByRole('button', { name: 'Add machine', exact: true }).click();
  for (const [label, value] of [
    ['Fleet / asset number', 'E2E-BROWSER'],
    ['Manufacturer', 'Browser Maker'],
    ['Model', 'Model One'],
    ['Category / equipment type', 'Scissor lift'],
  ])
    await page.getByLabel(label + ' *', { exact: true }).fill(value);
  await page
    .getByRole('combobox', { name: 'Branch', exact: true })
    .selectOption(data.north.id);
  const currency = page.getByRole('combobox', {
    name: 'Currency',
    exact: true,
  });
  await expectCurrencyChoices(currency);
  await page.getByLabel('Acquisition cost', { exact: true }).fill('1234.56');
  await currency.selectOption('USD');
  await page
    .getByRole('combobox', { name: 'VAT treatment', exact: true })
    .selectOption('EXCLUSIVE');
  await page.getByLabel('VAT rate (%)', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Save machine', exact: true }).click();
  await page.getByRole('button', { name: 'Edit machine', exact: true }).click();
  await expect(currency).toHaveValue('USD');
  await expect(
    page.getByLabel('Acquisition cost', { exact: true }),
  ).toHaveValue('1234.56');
  await currency.selectOption('EUR');
  await page
    .getByRole('combobox', { name: 'Language', exact: true })
    .selectOption('tr');
  const turkishCurrency = page.getByRole('combobox', {
    name: 'Para birimi',
    exact: true,
  });
  await expectCurrencyChoices(turkishCurrency);
  await expect(turkishCurrency).toHaveValue('EUR');
  await page
    .getByRole('combobox', { name: 'Dil', exact: true })
    .selectOption('en');
  await page.getByLabel('Model *', { exact: true }).fill('Model Corrected');
  await page.getByRole('button', { name: 'Save machine', exact: true }).click();
  await expect(
    page.getByText('Model Corrected', { exact: false }).first(),
  ).toBeVisible();
  const persisted = (
    await json(page, `organizations/${data.org.id}/machines?q=E2E-BROWSER`)
  ).body.items.find((m) => m.fleetNumber === 'E2E-BROWSER');
  expect(persisted.currency).toBe('EUR');
  expect(persisted.acquisitionCost).toBe('1234.56');
  await page.getByRole('link', { name: 'Machine list' }).click();
  await page
    .getByLabel('Search fleet, manufacturer, model or serial number', {
      exact: true,
    })
    .fill('E2E-BROWSER');
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await page.getByRole('link', { name: 'E2E-BROWSER', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Retire machine', exact: true })
    .click();
  await expect(
    page.getByText('Retired', { exact: true }).first(),
  ).toBeVisible();
});
