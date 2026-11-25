import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateAmount,
  lineEstimates,
} from '../apps/api/dist/analytics/valuation.js';
import { calculateReport } from '../apps/api/dist/analytics/calculation.js';
import { reportingPeriod } from '../apps/api/dist/analytics/period.js';
import { analyticsQuerySchema } from '../packages/validation/dist/index.js';
import {
  analyticsDurationValue,
  analyticsDurationLabel,
  formatAnalyticsDuration,
} from '../packages/i18n/dist/index.js';
const hour = 3600000,
  day = 24 * hour,
  start = Date.parse('2026-01-01T00:00:00Z');
for (const [unit, duration, expected] of [
  ['HOURLY', hour, '1500'],
  ['HOURLY', hour + 60000, '3000'],
  ['DAILY', day, '1500'],
  ['DAILY', day + 60000, '3000'],
  ['WEEKLY', 7 * day, '1500'],
  ['WEEKLY', 7 * day + 60000, '3000'],
  ['MONTHLY', 30 * day, '1500'],
  ['MONTHLY', 30 * day + 60000, '3000'],
])
  test(`ESTIMATE_V1 ${unit} duration ${duration}`, () =>
    assert.equal(
      estimateAmount('1500', unit, start, start + duration),
      expected,
    ));
test('estimate decimal precision, quantities, zero duration and invalid input', () => {
  assert.equal(
    estimateAmount('0.123456', 'DAILY', start, start + day, 3),
    '0.370368',
  );
  assert.equal(
    estimateAmount('999999999999999999999999', 'DAILY', start, start + 2 * day),
    '1999999999999999999999998',
  );
  assert.equal(estimateAmount('10', 'HOURLY', start, start), '0');
  for (const [rate, from, to, qty] of [
    ['-1', 0, 1, 1],
    ['NaN', 0, 1, 1],
    ['1', NaN, 1, 1],
    ['1', 2, 1, 1],
    ['1', 0, 1, 0],
  ])
    assert.throws(() => estimateAmount(rate, 'DAILY', from, to, qty));
});
for (const unit of ['FIXED_PERIOD', 'MANUAL'])
  test(`${unit} is a total line amount, independent of quantity/duration`, () => {
    assert.equal(
      estimateAmount('123.45', unit, start, start + 100 * day, 5),
      '123.45',
    );
    assert.equal(estimateAmount('123.45', unit, start, start, 5), '123.45');
  });
function item(end = start + day) {
  return {
    id: 'i',
    quantity: 1,
    plannedStartAt: new Date(start).toISOString(),
    plannedEndAt: new Date(start + 2 * day).toISOString(),
    agreedRate: '100',
    rateUnit: 'DAILY',
    currency: 'TRY',
    terms: [],
    assignments: [
      {
        id: 'a',
        machineId: 'm',
        releasedAt: null,
        actualStartAt: new Date(start).toISOString(),
        actualEndAt: new Date(end).toISOString(),
      },
    ],
  };
}
test('early and late completion preserve contracted estimate and change only actual estimate', () => {
  for (const [end, expected] of [
    [start + day, '100'],
    [start + 3 * day, '300'],
  ]) {
    const r = lineEstimates(item(end), 'COMPLETED', start + 10 * day);
    assert.equal(
      r.estimates.find((e) => e.stage === 'CONTRACTED_ESTIMATE').amount,
      '200',
    );
    assert.equal(
      r.estimates.find((e) => e.stage === 'COMPLETED_ESTIMATE').amount,
      expected,
    );
    assert.equal(r.estimates[0].valuationPolicy, 'ESTIMATE_V1');
  }
});
test('ACTIVE accrual uses one server clock and remains separate from contracted values', () => {
  const i = item();
  i.assignments[0].actualEndAt = null;
  const r = lineEstimates(i, 'ACTIVE', start + 3 * day + 60000);
  assert.equal(
    r.estimates.find((e) => e.stage === 'ACCRUED_ESTIMATE').amount,
    '400',
  );
  assert.equal(
    r.estimates.find((e) => e.stage === 'CONTRACTED_ESTIMATE').amount,
    '200',
  );
});
test('cancelled estimates are zero; missing/invalid actual dates never fabricate completion', () => {
  assert.equal(
    lineEstimates(item(), 'CANCELLED', start).estimates[0].amount,
    '0',
  );
  const i = item();
  i.assignments[0].actualEndAt = null;
  assert.equal(lineEstimates(i, 'COMPLETED', start + day).unavailable, true);
  i.plannedEndAt = 'invalid';
  assert.equal(lineEstimates(i, 'DRAFT', start).unavailable, true);
});
test('unchanged extension does not double-round; explicit revised extension uses historical segments', () => {
  const i = item();
  i.plannedEndAt = new Date(start + day).toISOString();
  i.terms = [
    {
      plannedStartAt: i.plannedStartAt,
      plannedEndAt: new Date(start + hour).toISOString(),
      agreedRate: '100',
      rateUnit: 'DAILY',
      currency: 'TRY',
    },
    {
      plannedStartAt: new Date(start + hour).toISOString(),
      plannedEndAt: i.plannedEndAt,
      agreedRate: '100',
      rateUnit: 'DAILY',
      currency: 'TRY',
    },
  ];
  assert.equal(lineEstimates(i, 'RESERVED', start).estimates[0].amount, '100');
  i.terms[1].agreedRate = '200';
  assert.deepEqual(
    lineEstimates(i, 'RESERVED', start).estimates.map((x) => x.amount),
    ['100', '200'],
  );
});
test('fixed/manual extensions preserve one line total and expose valueType', () => {
  for (const unit of ['FIXED_PERIOD', 'MANUAL']) {
    const i = item();
    i.rateUnit = unit;
    i.terms = [
      {
        plannedStartAt: i.plannedStartAt,
        plannedEndAt: new Date(start + day).toISOString(),
        agreedRate: '100',
        rateUnit: unit,
        currency: 'TRY',
      },
      {
        plannedStartAt: new Date(start + day).toISOString(),
        plannedEndAt: i.plannedEndAt,
        agreedRate: '100',
        rateUnit: unit,
        currency: 'TRY',
      },
    ];
    assert.equal(
      lineEstimates(i, 'RESERVED', start).estimates[0].amount,
      '100',
    );
    i.terms[1].agreedRate = '250';
    const e = lineEstimates(i, 'RESERVED', start).estimates[0];
    assert.equal(e.amount, '250');
    assert.equal(e.valueType, unit === 'MANUAL' ? 'MANUAL' : 'FIXED');
  }
});
test('UTC elapsed durations are independent of local clock/DST; presets use tenant timezone', () => {
  assert.equal(
    estimateAmount(
      '10',
      'HOURLY',
      Date.parse('2026-03-29T01:00:00+01:00'),
      Date.parse('2026-03-29T03:00:00+02:00'),
    ),
    '10',
  );
  const p = reportingPeriod(
    analyticsQuerySchema.parse({ preset: 'THIS_MONTH' }),
    new Date('2026-01-31T22:00:00Z'),
    'Europe/Istanbul',
  );
  assert.equal(new Date(p[0]).toISOString(), '2026-01-31T21:00:00.000Z');
  assert.equal(new Date(p[1]).toISOString(), '2026-02-28T21:00:00.000Z');
  assert.throws(() =>
    analyticsQuerySchema.parse({
      preset: 'CUSTOM',
      from: '2026-02-01T00:00:00Z',
      to: '2026-01-01T00:00:00Z',
    }),
  );
});
const visibility = {
  acquisition: true,
  pricing: true,
  costs: true,
  rentals: true,
  maintenance: true,
  customers: true,
  export: true,
};
const machine = (id, cost = '1000') => ({
  id,
  fleetNumber: id,
  modelId: 'model',
  model: 'Lift',
  categoryId: 'category',
  category: 'Access',
  branchId: null,
  branch: null,
  acquisitionDate: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  lifecycleState: 'ACTIVE',
  rentalState: 'NOT_RENTED',
  serviceState: 'NORMAL',
  acquisitionCost: cost,
  currency: 'TRY',
});
test('analytics duration presentation uses elapsed hours/days with localized precision', () => {
  assert.equal(analyticsDurationValue(5400, 'HOURS'), 1.5);
  assert.equal(analyticsDurationValue(129600, 'DAYS'), 1.5);
  assert.equal(formatAnalyticsDuration(129600, 'DAYS', 'en'), '1.5');
  assert.equal(formatAnalyticsDuration(129600, 'DAYS', 'tr'), '1,5');
  assert.equal(formatAnalyticsDuration(0, 'HOURS', 'en'), '0');
  assert.equal(formatAnalyticsDuration(1, 'HOURS', 'en'), '<0.01');
  assert.equal(formatAnalyticsDuration(1, 'DAYS', 'tr'), '<0,01');
  for (const missing of [null, NaN, Infinity, -1]) {
    assert.equal(analyticsDurationValue(missing, 'DAYS'), null);
    assert.equal(formatAnalyticsDuration(missing, 'DAYS', 'en'), '—');
  }
  assert.equal(
    analyticsDurationLabel('rentedSeconds', 'HOURS', 'en'),
    'Rented time (Hours)',
  );
  assert.equal(
    analyticsDurationLabel('rentedSeconds', 'DAYS', 'tr'),
    'Kiralanan süre (Gün)',
  );
});
test('duration display query accepts only hours/days and cannot change financial or utilization results', () => {
  assert.equal(analyticsQuerySchema.parse({}).durationUnit, 'DAYS');
  assert.equal(
    analyticsQuerySchema.safeParse({ durationUnit: 'SECONDS' }).success,
    false,
  );
  const data = {
    machines: [machine('m')],
    rentals: [
      {
        id: 'r',
        number: 'r',
        customerId: 'c',
        customer: 'Client',
        branchId: null,
        status: 'COMPLETED',
        items: [item()],
      },
    ],
    workOrders: [],
  };
  const reports = ['DAYS', 'HOURS'].map((durationUnit) =>
    calculateReport(
      data,
      analyticsQuerySchema.parse({ durationUnit }),
      visibility,
      [start, start + 2 * day],
      new Date(start + 2 * day),
      'Europe/Istanbul',
    ),
  );
  assert.deepEqual(reports[0], reports[1]);
  assert.equal(reports[0].summary.utilization.rentedSeconds, 86400);
  assert.equal(reports[0].summary.values[0].estimatedCompletedValue, '100');
});
test('replacement attribution, six-decimal residual, period conservation and utilization union', () => {
  const i = item(start + day);
  i.quantity = 1;
  i.agreedRate = '1';
  i.assignments = [0, 1, 2].map((n) => ({
    id: 'a' + n,
    machineId: 'm' + n,
    releasedAt:
      n < 2 ? new Date(start + (n + 1) * 8 * hour).toISOString() : null,
    actualStartAt: new Date(start + n * 8 * hour).toISOString(),
    actualEndAt: new Date(start + (n + 1) * 8 * hour).toISOString(),
  }));
  const d = {
    machines: [0, 1, 2].map((n) => machine('m' + n)),
    rentals: [
      {
        id: 'r',
        number: 'r',
        customerId: 'c',
        customer: 'Client',
        branchId: null,
        status: 'COMPLETED',
        items: [i],
      },
    ],
    workOrders: [],
  };
  const q = analyticsQuerySchema.parse({});
  const report = calculateReport(
    d,
    q,
    visibility,
    [start, start + 2 * day],
    new Date(start + 2 * day),
    'UTC',
  );
  assert.equal(report.summary.values[0].estimatedCompletedValue, '1');
  assert.deepEqual(
    report.items.map((r) => r.values[0].estimatedCompletedValue),
    ['0.333333', '0.333333', '0.333334'],
  );
  assert.equal(report.summary.utilization.rentedSeconds, 86400);
  assert.equal(report.summary.utilization.observationSeconds, 6 * 86400);
  const half = calculateReport(
    d,
    q,
    visibility,
    [start, start + 12 * hour],
    new Date(start + 2 * day),
    'UTC',
  );
  assert.equal(half.summary.values[0].estimatedCompletedValue, '0.5');
});
test('unknown/zero acquisition and mixed currencies suppress recovery; redaction removes inferred values', () => {
  const i = item(),
    d = {
      machines: [machine('m', null)],
      rentals: [
        {
          id: 'r',
          number: 'r',
          customerId: 'c',
          customer: 'Client',
          branchId: null,
          status: 'COMPLETED',
          items: [i],
        },
      ],
      workOrders: [
        {
          id: 'w',
          machineId: 'm',
          status: 'COMPLETED',
          occurredAt: new Date(start + day).toISOString(),
          costs: [{ kind: 'LABOR', amount: '20', currency: 'EUR' }],
        },
      ],
    };
  const run = (v = visibility) =>
    calculateReport(
      d,
      analyticsQuerySchema.parse({}),
      v,
      [start, start + 2 * day],
      new Date(start + 3 * day),
      'UTC',
    );
  assert.equal(run().items[0].lifetime.recovery, null);
  d.machines[0].acquisitionCost = '0';
  d.workOrders = [];
  assert.equal(run().items[0].lifetime.recovery.percentage, null);
  d.machines[0].acquisitionCost = '100';
  assert.equal(run().items[0].lifetime.recovery.percentage, '100');
  const hidden = run({ ...visibility, acquisition: false, costs: false });
  assert.ok(!('acquisitionCost' in hidden.items[0]));
  assert.ok(!('recovery' in hidden.items[0].lifetime));
  assert.ok(!('estimatedContribution' in hidden.summary.values[0]));
});
test('report ranking compares exact decimals, ties by ID, and paginates the whole result', () => {
  const rentals = ['10', '2', '10'].map((rate, n) => {
    const i = item();
    i.agreedRate = rate;
    i.assignments[0].machineId = 'm' + n;
    return {
      id: 'r' + n,
      number: 'r' + n,
      customerId: 'c',
      customer: 'Client',
      branchId: null,
      status: 'COMPLETED',
      items: [i],
    };
  });
  const d = {
    machines: [0, 1, 2].map((n) => machine('m' + n)),
    rentals,
    workOrders: [],
  };
  const q = analyticsQuerySchema.parse({
      sort: 'COMPLETED_VALUE',
      sortCurrency: 'TRY',
      limit: 2,
    }),
    run = (q) =>
      calculateReport(
        d,
        q,
        visibility,
        [start, start + 2 * day],
        new Date(start + 3 * day),
        'UTC',
      );
  const first = run(q);
  assert.deepEqual(
    first.items.map((r) => r.id),
    ['m0', 'm2'],
  );
  assert.equal(first.nextCursor, 'm2');
  assert.deepEqual(
    run({ ...q, cursor: first.nextCursor }).items.map((r) => r.id),
    ['m1'],
  );
  assert.equal(first.summary.values[0].estimatedCompletedValue, '22');
  assert.throws(() => analyticsQuerySchema.parse({ sort: 'COMPLETED_VALUE' }));
});
test('partial returns preserve line-window estimate while allocating actual machine time', () => {
  const i = item(start + 2 * day);
  i.quantity = 2;
  i.assignments.push({
    ...i.assignments[0],
    id: 'b',
    machineId: 'n',
    actualEndAt: new Date(start + day).toISOString(),
  });
  const d = {
    machines: [machine('m'), machine('n')],
    rentals: [
      {
        id: 'r',
        number: 'r',
        customerId: 'c',
        customer: 'Client',
        branchId: null,
        status: 'COMPLETED',
        items: [i],
      },
    ],
    workOrders: [],
  };
  const r = calculateReport(
    d,
    analyticsQuerySchema.parse({}),
    visibility,
    [start, start + 3 * day],
    new Date(start + 3 * day),
    'UTC',
  );
  assert.equal(r.summary.values[0].estimatedCompletedValue, '400');
  assert.equal(r.summary.utilization.rentedSeconds, 3 * 86400);
  assert.deepEqual(
    r.items.map((x) => x.values[0].estimatedCompletedValue),
    ['266.666667', '133.333333'],
  );
});
test('denominator respects acquisition, current lifecycle and future ranges without fabricated percentages', () => {
  const d = {
    machines: [
      machine('m'),
      { ...machine('sold'), lifecycleState: 'SOLD' },
      {
        ...machine('future'),
        acquisitionDate: new Date(start + 10 * day).toISOString(),
      },
    ],
    rentals: [],
    workOrders: [],
  };
  const q = analyticsQuerySchema.parse({}),
    r = calculateReport(
      d,
      q,
      visibility,
      [start - day, start + day],
      new Date(start + day),
      'UTC',
    );
  assert.equal(r.summary.utilization.observationSeconds, 86400);
  assert.equal(r.summary.utilization.excludedMachines, 2);
  assert.equal(r.summary.utilization.percentage, '0');
  const future = calculateReport(
    d,
    q,
    visibility,
    [start + 20 * day, start + 21 * day],
    new Date(start + day),
    'UTC',
  );
  assert.equal(future.summary.utilization.percentage, null);
});
test('cancelled costs, period boundaries and filtered histories do not fabricate recovery', () => {
  const i = item(),
    d = {
      machines: [machine('m')],
      rentals: [
        {
          id: 'r',
          number: 'r',
          customerId: 'c',
          customer: 'Client',
          branchId: null,
          status: 'CANCELLED',
          items: [i],
        },
      ],
      workOrders: [
        {
          id: 'w',
          machineId: 'm',
          status: 'CANCELLED',
          occurredAt: new Date(start).toISOString(),
          costs: [{ kind: 'LABOR', amount: '999', currency: 'TRY' }],
        },
      ],
    };
  const run = (q = analyticsQuerySchema.parse({})) =>
    calculateReport(
      d,
      q,
      visibility,
      [start, start + day],
      new Date(start + 3 * day),
      'UTC',
    );
  assert.equal(run().summary.values[0].maintenanceCost, '0');
  assert.equal(run().summary.values[0].estimatedCompletedValue, '0');
  assert.equal(run().summary.utilization.rentedSeconds, 0);
  d.workOrders[0].status = 'COMPLETED';
  d.workOrders[0].occurredAt = new Date(start + day).toISOString();
  assert.equal(run().summary.values[0].maintenanceCost, '0');
  assert.ok(
    !(
      'lifetime' in
      run(analyticsQuerySchema.parse({ status: 'CANCELLED' })).items[0]
    ),
  );
});
