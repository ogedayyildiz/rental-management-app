import { test, expect, json } from './fixtures.mjs';
const stamp = (days = 0) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
async function draft(page, data, notes) {
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
  await form.getByLabel('Planned start (UTC)').fill(stamp(-1));
  await form.getByLabel('Planned end (UTC)').fill(stamp(2));
  await form.getByLabel('Agreed rate', { exact: true }).fill('4567.89');
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
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirm reservation', exact: true }),
  ).toBeVisible();
  return (
    await json(page, `organizations/${data.org.id}/rentals`)
  ).body.items.find((x) => x.notes === notes);
}
test('rental UI reserve, conflict, dispatch, extend, return and complete', async ({
  page,
  data,
}) => {
  page.on('dialog', (d) => d.accept());
  const first = await draft(page, data, 'Browser main rental');
  // Prepare a competing draft before the first reservation commits.
  const second = await draft(page, data, 'Browser competing rental');
  await page.goto(`/rentals/${first.id}?organizationId=${data.org.id}`);
  await page
    .getByRole('button', { name: 'Confirm reservation', exact: true })
    .click();
  const machine = async () =>
    (
      await json(
        page,
        `organizations/${data.org.id}/machines/${data.machine.id}`,
      )
    ).body;
  await expect.poll(async () => (await machine()).rentalState).toBe('RESERVED');
  await page.goto(`/rentals/${second.id}?organizationId=${data.org.id}`);
  await page
    .getByRole('button', { name: 'Confirm reservation', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Availability changed' }),
  ).toBeVisible();
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Competing request cancelled');
  await page
    .getByRole('button', { name: 'Cancel rental', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await json(page, `organizations/${data.org.id}/rentals/${second.id}`))
          .body.status,
    )
    .toBe('CANCELLED');
  await page.goto(`/rentals/${first.id}?organizationId=${data.org.id}`);
  await page
    .getByRole('checkbox', { name: new RegExp(data.machine.fleetNumber) })
    .check();
  await page.getByLabel('Actual timestamp (UTC)').fill(stamp(-0.01));
  await page.getByRole('button', { name: 'Dispatch', exact: true }).click();
  await expect.poll(async () => (await machine()).rentalState).toBe('RENTED');
  await page.getByLabel('New planned end (UTC)').fill(stamp(3));
  await page
    .getByRole('button', { name: 'Extend period', exact: true })
    .click();
  await expect
    .poll(async () =>
      (
        await json(page, `organizations/${data.org.id}/rentals/${first.id}`)
      ).body.plannedEndAt.slice(0, 10),
    )
    .toBe(stamp(3).slice(0, 10));
  await page
    .getByRole('checkbox', { name: new RegExp(data.machine.fleetNumber) })
    .check();
  await page.getByLabel('Actual timestamp (UTC)').fill(stamp());
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await expect
    .poll(async () => (await machine()).rentalState)
    .toBe('NOT_RENTED');
  await page
    .getByRole('button', { name: 'Complete rental', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await json(page, `organizations/${data.org.id}/rentals/${first.id}`))
          .body.status,
    )
    .toBe('COMPLETED');
});
