import test from 'node:test';
import assert from 'node:assert/strict';
import { rentalTransportInputSchema } from '../packages/validation/dist/index.js';
import { transportAmounts } from '../apps/api/dist/rentals/transportation.js';
import { transportSummary } from '../apps/api/dist/analytics/transportation.js';
const quote = (extra = {}) => ({
  currency: 'TRY',
  customerPrice: '1200',
  customerTax: { mode: 'INCLUSIVE', rate: '20' },
  supplierQuote: {
    name: null,
    amount: '800',
    tax: { mode: 'EXCLUSIVE', rate: '10' },
  },
  ...extra,
});
test('transport quote margin uses separate VAT bases and decimal arithmetic, including losses and zero', () => {
  assert.deepEqual(transportAmounts(quote()), {
    customerNet: '1000.00',
    supplierNet: '800.00',
    estimatedMargin: '200.00',
  });
  assert.equal(
    transportAmounts(quote({ customerPrice: '0' })).estimatedMargin,
    '-800.00',
  );
  assert.equal(
    transportAmounts(
      quote({
        customerPrice: '0.30',
        customerTax: { mode: 'NOT_APPLICABLE', reason: 'Explicit test basis' },
        supplierQuote: {
          name: null,
          amount: '0.10',
          tax: { mode: 'EXCLUSIVE', rate: '0' },
        },
      }),
    ).estimatedMargin,
    '0.20',
  );
  assert.equal(
    transportAmounts(quote({ supplierQuote: null })).estimatedMargin,
    null,
  );
  assert.equal(
    transportAmounts(quote({ customerPrice: '1.00', supplierQuote: null }))
      .customerNet,
    '0.83',
  );
});
test('transport contract rejects negative, overprecision, unsupported currency, unspecified VAT and injected IDs', () => {
  assert.equal(rentalTransportInputSchema.safeParse(quote()).success, true);
  for (const data of [
    quote({ customerPrice: '-1' }),
    quote({ customerPrice: '1.001' }),
    quote({ customerPrice: 'NaN' }),
    quote({ currency: 'GBP' }),
    quote({ customerTax: { mode: 'UNSPECIFIED' } }),
    quote({ organizationId: 'injected' }),
    quote({
      supplierQuote: {
        amount: '20',
        tax: { mode: 'NOT_APPLICABLE', reason: '' },
      },
    }),
  ])
    assert.equal(rentalTransportInputSchema.safeParse(data).success, false);
});
test('transport summaries count quotes once, separate currency/stage, exclude cancelled dates and do not fabricate missing costs', () => {
  const from = Date.parse('2026-01-01T00:00:00Z'),
    to = Date.parse('2026-02-01T00:00:00Z');
  const row = (
    id,
    status,
    q = quote(),
    plannedStartAt = '2026-01-10T00:00:00Z',
  ) => ({
    id,
    status,
    plannedStartAt,
    createdAt: '2026-01-01T00:00:00Z',
    transportation: q,
  });
  const rows = [
    row('1', 'RESERVED'),
    row('2', 'COMPLETED'),
    row('3', 'CANCELLED'),
    row('4', 'RESERVED', quote({ currency: 'EUR' })),
    row('5', 'RESERVED', quote(), new Date(to).toISOString()),
  ];
  const full = transportSummary(
    rows,
    { pricing: true, transportCosts: true },
    from,
    to,
  );
  assert.equal(full.length, 3);
  assert.equal(
    full.find((r) => r.status === 'RESERVED' && r.currency === 'TRY')
      .estimatedMargin,
    '200.00',
  );
  const missing = transportSummary(
    [...rows, row('6', 'RESERVED', quote({ supplierQuote: null }))],
    { pricing: true, transportCosts: true },
    from,
    to,
  ).find((r) => r.status === 'RESERVED' && r.currency === 'TRY');
  assert.equal(missing.customerNet, '2000.00');
  assert.equal(missing.supplierNet, null);
  assert.equal(missing.estimatedMargin, null);
  assert.equal(missing.missingSupplierQuotes, 1);
  for (const r of transportSummary(
    rows,
    { pricing: true, transportCosts: false },
    from,
    to,
  )) {
    assert.equal(r.customerNet, '1000.00');
    for (const field of [
      'supplierNet',
      'estimatedMargin',
      'missingSupplierQuotes',
    ])
      assert.equal(Object.hasOwn(r, field), false);
  }
  for (const r of transportSummary(
    rows,
    { pricing: false, transportCosts: true },
    from,
    to,
  )) {
    assert.equal(Object.hasOwn(r, 'customerNet'), false);
    assert.equal(Object.hasOwn(r, 'estimatedMargin'), false);
  }
});
