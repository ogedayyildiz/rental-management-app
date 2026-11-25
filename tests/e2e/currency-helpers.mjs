import { expect } from './fixtures.mjs';

export async function expectCurrencyChoices(select) {
  await expect(select).toBeVisible();
  const options = select.locator('option:not([value=""]):not([hidden])');
  await expect(options).toHaveText(['TL', 'USD', 'EUR']);
  expect(
    await options.evaluateAll((rows) => rows.map((row) => row.value)),
  ).toEqual(['TRY', 'USD', 'EUR']);
}
