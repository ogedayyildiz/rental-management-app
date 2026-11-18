import { test, expect, json } from './fixtures.mjs';

test('tenant admin enters business UI; active customer selector regression', async ({
  page,
  data,
}) => {
  await page.goto('/rentals');
  await page
    .getByRole('button', { name: 'Create rental', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Find customers', exact: true })
    .click();
  const select = page.getByRole('combobox', { name: 'Customer', exact: true });
  await expect(
    select.getByRole('option', {
      includeHidden: true,
      name: data.customer.displayName,
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    select.getByRole('option', {
      includeHidden: true,
      name: data.customer2.displayName,
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    select.getByRole('option', {
      includeHidden: true,
      name: 'E2E Archived Customer',
      exact: true,
    }),
  ).toHaveCount(0);
  await select.selectOption(data.customer.id);
  await expect(select).toHaveValue(data.customer.id);
});

test('calendar plan target, recurrence, reload, edit and deactivate', async ({
  page,
  data,
}) => {
  await page.goto('/maintenance');
  const plans = page.getByRole('region', {
    name: 'Maintenance plans',
    exact: true,
  });
  await expect(plans).toBeVisible();
  const form = plans.getByRole('form', { name: 'Calendar plan' });
  await form.getByLabel('Plan name').fill('E2E Monthly inspection');
  await form.getByLabel('Interval', { exact: true }).fill('2');
  await form
    .getByRole('combobox', { name: 'Interval unit', exact: true })
    .selectOption('MONTHS');
  await form
    .getByRole('combobox', { name: 'Next due based on', exact: true })
    .selectOption('SCHEDULED');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    plans.getByRole('article', { name: 'E2E Monthly inspection' }).first(),
  ).toBeVisible();
  await plans
    .getByRole('combobox', { name: 'Machines', exact: true })
    .selectOption(data.workMachine.id);
  const assign = plans.getByRole('form', { name: 'Assign calendar plan' });
  await assign
    .getByRole('combobox', { name: 'Maintenance plans', exact: true })
    .selectOption({ label: 'E2E Monthly inspection' });
  await assign.getByLabel('Next due (UTC)').fill('2031-01-31T10:00');
  await assign.getByRole('button', { name: 'Assign calendar plan' }).click();
  await page.reload();
  await plans
    .getByRole('combobox', { name: 'Machines', exact: true })
    .selectOption(data.workMachine.id);
  await expect(
    plans
      .getByRole('article', { name: 'E2E Monthly inspection', exact: true })
      .getByRole('button', { name: 'Create work order from schedule' }),
  ).toBeVisible();
  let schedules = (
    await json(
      page,
      `organizations/${data.org.id}/maintenance/machines/${data.workMachine.id}/plans`,
    )
  ).body;
  expect(
    schedules.find((s) => s.planName === 'E2E Monthly inspection').nextDueAt,
  ).toBe('2031-01-31T10:00:00.000Z');
  expect(
    (
      await json(
        page,
        `organizations/${data.org.id}/machines/${data.workMachine.id}`,
      )
    ).body.serviceState,
  ).toBe('NORMAL');
  const planArticle = plans
    .getByRole('article', { name: 'E2E Monthly inspection', exact: true })
    .filter({
      has: page.getByRole('button', { name: 'Edit plan', exact: true }),
    });
  await planArticle
    .getByRole('button', { name: 'Edit plan', exact: true })
    .click();
  await form.getByLabel('Interval', { exact: true }).fill('1');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await assign.getByLabel('Next due (UTC)').fill('2031-02-28T10:00');
  await assign.getByRole('button', { name: 'Assign calendar plan' }).click();
  await planArticle
    .getByRole('button', { name: 'Deactivate plan', exact: true })
    .click();
  await page.reload();
  await plans
    .getByRole('combobox', { name: 'Machines', exact: true })
    .selectOption(data.workMachine.id);
  await expect(
    plans
      .getByRole('article', { name: 'E2E Monthly inspection', exact: true })
      .getByRole('button', { name: 'Create work order from schedule' }),
  ).toHaveCount(0);
});

for (const persona of [
  'PLATFORM_OPERATOR',
  'SECOND_TENANT_ADMIN',
  'TENANT_LIMITED',
  'TENANT_NO_FINANCE',
]) {
  test.describe(persona, () => {
    test.use({ persona });
    test('database authorization remains active through browser bridge', async ({
      page,
      data,
    }) => {
      await page.goto('/machines');
      const response = await json(
        page,
        `organizations/${data.org.id}/machines/${data.otherBranch.id}`,
      );
      if (persona === 'PLATFORM_OPERATOR' || persona === 'SECOND_TENANT_ADMIN')
        expect(response.status).toBe(403);
      else if (persona === 'TENANT_LIMITED') expect(response.status).toBe(404);
      else {
        expect(response.status).toBe(200);
        const row = (
          await json(
            page,
            `organizations/${data.org.id}/machines/${data.machine.id}`,
          )
        ).body;
        expect(row).not.toHaveProperty('acquisitionCost');
        await page
          .getByRole('link', { name: 'E2E-NORTH', exact: true })
          .click();
        await expect(page.getByText('87654.123')).toHaveCount(0);
      }
      if (persona === 'PLATFORM_OPERATOR')
        await expect(
          page.getByRole('button', { name: 'Add machine', exact: true }),
        ).toHaveCount(0);
      if (persona === 'TENANT_LIMITED')
        await expect(
          page.getByRole('link', { name: 'E2E-SOUTH', exact: true }),
        ).toHaveCount(0);
    });
  });
}
