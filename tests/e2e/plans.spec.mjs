import { test, expect, json } from './fixtures.mjs';
for (const deactivate of [false, true])
  test(`completion-based recurrence ${deactivate ? 'stops after deactivation' : 'advances from completion'}`, async ({
    page,
    data,
  }) => {
    await page.goto('/maintenance');
    const title = deactivate
      ? 'Inactive completion plan'
      : 'Active completion plan';
    const plans = page.getByRole('region', {
      name: 'Maintenance plans',
      exact: true,
    });
    const form = plans.getByRole('form', { name: 'Calendar plan' });
    await form.getByLabel('Plan name').fill(title);
    await form.getByLabel('Interval', { exact: true }).fill('3');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await plans
      .getByRole('combobox', { name: 'Machines', exact: true })
      .selectOption(data.workMachine.id);
    const assign = plans.getByRole('form', { name: 'Assign calendar plan' });
    await assign
      .getByRole('combobox', { name: 'Maintenance plans', exact: true })
      .selectOption({ label: title });
    await assign.getByLabel('Next due (UTC)').fill('2020-01-01T10:00');
    await assign.getByRole('button', { name: 'Assign calendar plan' }).click();
    const article = plans.getByRole('article', { name: title, exact: true });
    await article
      .getByRole('button', { name: 'Create work order from schedule' })
      .click();
    await page
      .getByRole('button', { name: 'Accept / open', exact: true })
      .click();
    await page.getByRole('button', { name: 'Start work', exact: true }).click();
    if (deactivate) {
      await article
        .getByRole('button', { name: 'Deactivate plan', exact: true })
        .click();
      await expect(
        article.getByRole('button', { name: 'Activate plan', exact: true }),
      ).toBeVisible();
    }
    await page
      .getByLabel('Completion notes / cancellation reason')
      .fill('Completed recurrence check');
    await page
      .getByRole('button', { name: 'Complete work order', exact: true })
      .click();
    const base = `organizations/${data.org.id}/maintenance`;
    await expect
      .poll(
        async () =>
          (await json(page, base + '?q=' + encodeURIComponent(title))).body
            .items[0].status,
      )
      .toBe('COMPLETED');
    const order = (await json(page, base + '?q=' + encodeURIComponent(title)))
      .body.items[0];
    const schedule = (
      await json(page, `${base}/machines/${data.workMachine.id}/plans`)
    ).body.find((s) => s.planName === title);
    expect(schedule.nextDueAt).toBe(
      deactivate
        ? '2020-01-01T10:00:00.000Z'
        : new Date(
            new Date(order.completedAt).getTime() + 3 * 86400000,
          ).toISOString(),
    );
    if (!deactivate)
      await article
        .getByRole('button', { name: 'Deactivate plan', exact: true })
        .click();
  });
test('linked plan work order advances next occurrence once and inactive plan rejects generation', async ({
  page,
  data,
}) => {
  await page.goto('/maintenance');
  const plans = page.getByRole('region', {
    name: 'Maintenance plans',
    exact: true,
  });
  const form = plans.getByRole('form', { name: 'Calendar plan' });
  await form.getByLabel('Plan name').fill('Browser monthly recurrence');
  await form.getByLabel('Interval', { exact: true }).fill('1');
  await form
    .getByRole('combobox', { name: 'Interval unit', exact: true })
    .selectOption('MONTHS');
  await form
    .getByRole('combobox', { name: 'Next due based on', exact: true })
    .selectOption('SCHEDULED');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    plans.getByRole('article', {
      name: 'Browser monthly recurrence',
      exact: true,
    }),
  ).toBeVisible();
  await plans
    .getByRole('combobox', { name: 'Machines', exact: true })
    .selectOption(data.workMachine.id);
  const assign = plans.getByRole('form', { name: 'Assign calendar plan' });
  await assign
    .getByRole('combobox', { name: 'Maintenance plans', exact: true })
    .selectOption({ label: 'Browser monthly recurrence' });
  await assign.getByLabel('Next due (UTC)').fill('2020-01-31T10:00');
  await assign.getByRole('button', { name: 'Assign calendar plan' }).click();
  const scheduleArticle = plans
    .getByRole('article', { name: 'Browser monthly recurrence', exact: true })
    .filter({
      has: page.getByRole('button', {
        name: 'Create work order from schedule',
      }),
    });
  await scheduleArticle
    .getByRole('button', { name: 'Create work order from schedule' })
    .click();
  await page
    .getByRole('button', { name: 'Accept / open', exact: true })
    .click();
  await page.getByRole('button', { name: 'Start work', exact: true }).click();
  await page
    .getByLabel('Completion notes / cancellation reason')
    .fill('Calendar service performed');
  await page
    .getByRole('button', { name: 'Complete work order', exact: true })
    .click();
  await expect(
    scheduleArticle.getByText('2020-02-29T10:00:00.000Z', { exact: true }),
  ).toBeVisible();
  const base = `organizations/${data.org.id}/maintenance`;
  const schedule = (
    await json(page, `${base}/machines/${data.workMachine.id}/plans`)
  ).body.find((x) => x.planName === 'Browser monthly recurrence');
  const order = (await json(page, `${base}?q=Browser monthly recurrence`)).body
    .items[0];
  expect(order.machinePlanId).toBe(schedule.id);
  expect(order.status).toBe('COMPLETED');
  expect(
    (await json(page, `${base}?overdue=true`)).body.items.some(
      (x) => x.id === order.id,
    ),
  ).toBe(false);
  await json(page, `${base}/${order.id}/complete`, 'POST', {
    notes: 'Retry completed request',
  });
  expect(
    (
      await json(page, `${base}/machines/${data.workMachine.id}/plans`)
    ).body.find((x) => x.id === schedule.id).nextDueAt,
  ).toBe('2020-02-29T10:00:00.000Z');
  const planArticle = plans
    .getByRole('article', { name: 'Browser monthly recurrence', exact: true })
    .filter({ has: page.getByRole('button', { name: 'Deactivate plan' }) });
  await planArticle.getByRole('button', { name: 'Deactivate plan' }).click();
  await expect(scheduleArticle).toHaveCount(0);
  expect(
    (
      await json(page, base, 'POST', {
        machineId: data.workMachine.id,
        machinePlanId: schedule.id,
        type: 'PREVENTIVE',
        title: 'Forbidden inactive occurrence',
      })
    ).status,
  ).toBe(404);
});
