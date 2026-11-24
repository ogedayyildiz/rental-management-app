import { test, expect, json } from './fixtures.mjs';
test('rental workflow: partial return leaves remaining machine rented and explains completion', async ({
  page,
  data,
}) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/rentals');
  const base = `organizations/${data.org.id}`,
    units = [];
  for (const number of ['PARTIAL-A', 'PARTIAL-B']) {
    const response = await json(page, base + '/machines', 'POST', {
      fleetNumber: number,
      manufacturer: 'Browser',
      model: 'Partial return',
      category: 'Scissor',
      branchId: data.north.id,
    });
    expect(response.status).toBe(201);
    units.push(response.body);
  }
  const start = new Date(Date.now() - 86400000).toISOString(),
    end = new Date(Date.now() + 86400000).toISOString();
  const response = await json(page, base + '/rentals', 'POST', {
    customerId: data.customer.id,
    branchId: data.north.id,
    items: [
      {
        quantity: 2,
        machineIds: units.map((m) => m.id),
        plannedStartAt: start,
        plannedEndAt: end,
        agreedRate: '100',
        currency: 'TRY',
        tax: { mode: 'EXCLUSIVE', rate: '0' },
        rateUnit: 'DAILY',
      },
    ],
  });
  expect(response.status).toBe(201);
  const id = response.body.id;
  await page.goto(`/rentals/${id}?organizationId=${data.org.id}`);
  await page
    .getByRole('button', { name: 'Confirm reservation', exact: true })
    .click();
  for (const m of units)
    await page
      .getByRole('checkbox', { name: new RegExp(m.fleetNumber) })
      .check();
  await page
    .getByLabel('Actual timestamp (UTC)')
    .fill(new Date(Date.now() - 600000).toISOString().slice(0, 16));
  await page.getByRole('button', { name: 'Dispatch', exact: true }).click();
  await expect(page.getByText(/it does not record payment/)).toBeVisible();
  await page.getByRole('checkbox', { name: /PARTIAL-A/ }).check();
  await page
    .getByLabel('Actual timestamp (UTC)')
    .fill(new Date().toISOString().slice(0, 16));
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Complete rental', exact: true }),
  ).toBeDisabled();
  await expect
    .poll(
      async () =>
        (await json(page, base + '/machines/' + units[0].id)).body.rentalState,
    )
    .toBe('NOT_RENTED');
  expect(
    (await json(page, base + '/machines/' + units[1].id)).body.rentalState,
  ).toBe('RENTED');
  await page.getByRole('checkbox', { name: /PARTIAL-B/ }).check();
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Complete rental', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Complete rental', exact: true })
    .click();
  await expect
    .poll(async () => (await json(page, base + '/rentals/' + id)).body.status)
    .toBe('COMPLETED');
});
