import { test, expect, json } from './fixtures.mjs';
import { expectCurrencyChoices } from './currency-helpers.mjs';
const base = (data) => `organizations/${data.org.id}/finance/records`;
const editor = (page) =>
  page.locator('form').filter({
    has: page.getByRole('heading', {
      name: 'New financial record',
      exact: true,
    }),
  });
async function draft(
  page,
  data,
  {
    kind = 'RECEIVABLE',
    title = 'Browser receivable',
    mode = 'EXCLUSIVE',
    method = 'OPEN_ACCOUNT',
  } = {},
) {
  await page.goto(
    `/finance/records?organizationId=${data.org.id}&kind=${kind}`,
  );
  await page
    .getByRole('button', { name: 'New financial record', exact: true })
    .click();
  const form = editor(page);
  await form.getByLabel('Record title', { exact: true }).fill(title);
  await form
    .getByRole('combobox', {
      name: kind === 'RECEIVABLE' ? 'Customer' : 'Machine',
      exact: true,
    })
    .selectOption(kind === 'RECEIVABLE' ? data.customer.id : data.machine.id);
  await form
    .getByRole('combobox', { name: 'Responsible branch', exact: true })
    .selectOption(data.north.id);
  if (kind === 'PAYABLE') {
    await form
      .getByRole('combobox', { name: 'Acquisition arrangement', exact: true })
      .selectOption(method);
    await form
      .getByLabel('Seller / leasing company', { exact: true })
      .fill('Browser supplier');
  }
  await form.getByLabel('Transaction date', { exact: true }).fill('2026-01-01');
  await form.getByLabel('Entered amount', { exact: true }).fill('100');
  const currency = form.getByRole('combobox', {
    name: 'Currency',
    exact: true,
  });
  await expectCurrencyChoices(currency);
  await currency.selectOption('TRY');
  await form
    .getByRole('combobox', { name: 'VAT treatment', exact: true })
    .selectOption(mode);
  if (mode === 'NOT_APPLICABLE')
    await form
      .getByLabel('Reason VAT does not apply', { exact: true })
      .fill('Recorded transaction applicability');
  else await form.getByLabel('VAT rate (%)', { exact: true }).fill('20');
  return form;
}
async function approve(page) {
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Approve amount and schedule', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Record payment / collection',
      exact: true,
    }),
  ).toBeVisible();
}
async function pay(page, amount) {
  const form = page.locator('form').filter({
    has: page.getByRole('heading', {
      name: 'Record payment / collection',
      exact: true,
    }),
  });
  await form
    .getByRole('combobox', { name: 'Due schedule', exact: true })
    .selectOption({ index: 1 });
  await form.getByLabel('Entered amount (TRY)', { exact: true }).fill(amount);
  await form
    .getByLabel('Payment / collection date', { exact: true })
    .fill('2026-01-02');
  await expect(
    form
      .getByRole('combobox', { name: 'Payment method', exact: true })
      .getByRole('option'),
  ).toHaveText([
    'Choose…',
    'Cash',
    'Bank transfer',
    'Card',
    'Other payment method',
  ]);
  await form
    .getByRole('combobox', { name: 'Payment method', exact: true })
    .selectOption('BANK_TRANSFER');
  await form
    .getByRole('button', { name: 'Record payment / collection', exact: true })
    .click();
}
test('operational finance: VAT receivable, approval, partial collection, idempotency and account balance', async ({
  page,
  data,
}) => {
  const form = await draft(page, data);
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('grossAmount')).toHaveText('120.00 TRY');
  await expect(page.getByTestId('taxAmount')).toHaveText('20.00 TRY');
  await approve(page);
  await pay(page, '40');
  await expect(page.getByTestId('remainingAmount')).toHaveText('80.00 TRY');
  const record = (
    await json(page, base(data) + '?kind=RECEIVABLE&q=Browser receivable')
  ).body.items[0];
  expect(record.tax).toEqual({ mode: 'EXCLUSIVE', rate: '20' });
  expect(record.payments).toHaveLength(1);
  await pay(page, '81');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Payments cannot exceed',
  );
  await expect(page.getByTestId('remainingAmount')).toHaveText('80.00 TRY');
  const document = page.locator('form').filter({
    has: page.getByRole('button', {
      name: 'Update document reference',
      exact: true,
    }),
  });
  await document
    .getByRole('combobox', { name: 'Document status', exact: true })
    .selectOption('RECORDED');
  await document
    .getByLabel('Document reference', { exact: true })
    .fill('INV-BROWSER');
  await document
    .getByRole('button', { name: 'Update document reference', exact: true })
    .click();
  await expect(
    page.getByText('Invoice recorded · INV-BROWSER', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('taxAmount')).toHaveText('20.00 TRY');
  await page
    .getByRole('button', { name: 'Back to records', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Approved account totals (separate currencies)',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'TRY · Total payable / receivable: 120.00 · Paid / collected: 40.00 · Outstanding balance: 80.00',
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', { name: 'Browser receivable', exact: true })
    .click();
  await expect(page.getByTestId('remainingAmount')).toHaveText('80.00 TRY');
  await expect(
    page.getByText('Invoice recorded · INV-BROWSER', { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Cancellation / reversal reason', { exact: true })
    .fill('Wrong transfer');
  await page
    .getByRole('button', { name: 'Reverse payment', exact: true })
    .click();
  await expect(page.getByTestId('remainingAmount')).toHaveText('120.00 TRY');
  await expect(
    page.getByText('Reversed', { exact: false }).first(),
  ).toBeVisible();
  // A separate south-branch obligation exists for the selected-branch negative test.
  const south = await json(page, base(data), 'POST', {
    kind: 'RECEIVABLE',
    title: 'Hidden south obligation',
    customerId: data.customer.id,
    machineId: null,
    rentalId: null,
    branchId: data.south.id,
    acquisitionMethod: null,
    counterpartyName: null,
    occurredOn: '2026-01-01',
    amount: '900',
    currency: 'TRY',
    tax: { mode: 'INCLUSIVE', rate: '20' },
    documentStatus: 'NONE',
    documentReference: null,
    notes: null,
    installments: [],
  });
  expect(south.status).toBe(201);
  expect(
    (
      await json(page, `${base(data)}/${south.body.id}/confirm`, 'POST', {
        version: south.body.updatedAt,
      })
    ).status,
  ).toBe(201);
});
test('operational finance: leasing deposit and installment schedule survives reload and records payment', async ({
  page,
  data,
}) => {
  const form = await draft(page, data, {
    kind: 'PAYABLE',
    title: 'Browser leasing',
    mode: 'INCLUSIVE',
    method: 'LEASING',
  });
  for (const [index, kind, amount, due] of [
    [1, 'DEPOSIT', '20', '2026-01-01'],
    [2, 'INSTALLMENT', '80', '2026-02-01'],
  ]) {
    await form
      .getByRole('button', { name: 'Add due item', exact: true })
      .click();
    const group = form.getByRole('group', {
      name: `Due schedule ${index}`,
      exact: true,
    });
    await group
      .getByRole('combobox', { name: 'Due item type', exact: true })
      .selectOption(kind);
    await group.getByLabel('Due date', { exact: true }).fill(due);
    await group.getByLabel('Entered amount', { exact: true }).fill(amount);
  }
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('grossAmount')).toHaveText('100.00 TRY');
  await expect(page.getByTestId('netAmount')).toHaveText('83.33 TRY');
  await approve(page);
  await pay(page, '20');
  await expect(page.getByTestId('remainingAmount')).toHaveText('80.00 TRY');
  await page.reload();
  await page
    .getByRole('button', { name: 'Browser leasing', exact: true })
    .click();
  await expect(page.getByTestId('remainingAmount')).toHaveText('80.00 TRY');
  await expect(
    page.getByRole('row').filter({ hasText: 'Installment' }),
  ).toContainText('80.00');
  const record = (
    await json(page, base(data) + '?kind=PAYABLE&q=Browser leasing')
  ).body.items[0];
  expect(record.acquisitionMethod).toBe('LEASING');
  expect(record.installments).toHaveLength(2);
  expect(record.documentStatus).toBe('NONE');
});
test('operational finance: open account with explicit non-applicable VAT and cancelled draft', async ({
  page,
  data,
}) => {
  const form = await draft(page, data, {
    kind: 'PAYABLE',
    title: 'Browser open account',
    mode: 'NOT_APPLICABLE',
  });
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('grossAmount')).toHaveText('100.00 TRY');
  await expect(page.getByTestId('taxAmount')).toHaveText('0.00 TRY');
  await page
    .getByLabel('Cancellation / reversal reason', { exact: true })
    .fill('Testing cancelled purchase');
  await page
    .getByRole('button', { name: 'Cancel financial record', exact: true })
    .click();
  await expect(
    page.getByText('Cancelled · Unpaid', { exact: false }),
  ).toBeVisible();
});
test.describe('operational finance selected branch', () => {
  test.use({ persona: 'TENANT_LIMITED' });
  test('account totals and records omit the hidden branch; write remains forbidden', async ({
    page,
    data,
  }) => {
    await page.goto(`/finance/records?organizationId=${data.org.id}`);
    await expect(
      page.getByRole('button', { name: 'Browser receivable', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Hidden south obligation', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'New financial record', exact: true }),
    ).toHaveCount(0);
    const balances = await json(page, base(data) + '/balances?kind=RECEIVABLE');
    expect(balances.status).toBe(200);
    expect(balances.body).toEqual([
      {
        currency: 'TRY',
        grossAmount: '120.00',
        paidAmount: '0.00',
        remainingAmount: '120.00',
      },
    ]);
    expect(
      (
        await json(
          page,
          base(data) + '?kind=RECEIVABLE&branchId=' + data.south.id,
        )
      ).body.items,
    ).toHaveLength(0);
  });
});
for (const persona of [
  'TENANT_NO_FINANCE',
  'PLATFORM_OPERATOR',
  'SECOND_TENANT_ADMIN',
])
  test.describe(`operational finance denial ${persona}`, () => {
    test.use({ persona });
    test('cannot access another tenant or unauthorized financial balances', async ({
      page,
      data,
    }) => {
      await page.goto('/');
      const r = await json(page, base(data) + '?kind=RECEIVABLE');
      expect([403, 404]).toContain(r.status);
      const b = await json(page, base(data) + '/balances?kind=PAYABLE');
      expect([403, 404]).toContain(b.status);
    });
  });

test('operational finance: linked rental cannot silently reassign an approved receivable', async ({
  page,
  data,
}) => {
  const form = await draft(page, data, { title: 'Linked rental receivable' });
  await form
    .getByRole('combobox', { name: 'Related rental', exact: true })
    .selectOption(data.financialRental.id);
  await form
    .getByRole('combobox', { name: 'Responsible branch', exact: true })
    .selectOption(data.south.id);
  await form.getByRole('button', { name: 'Save draft', exact: true }).click();
  await approve(page);
  await page.goto(
    `/rentals/${data.financialRental.id}?organizationId=${data.org.id}`,
  );
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page
    .getByRole('button', { name: 'Find customers', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Customer', exact: true })
    .selectOption(data.customer2.id);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'This rental is linked to a financial record',
  );
  const records = (
    await json(page, base(data) + '?kind=RECEIVABLE&q=Linked rental receivable')
  ).body.items;
  expect(records).toHaveLength(1);
  expect(records[0].customerId).toBe(data.customer.id);
  expect(records[0].status).toBe('CONFIRMED');
});
