import { Decimal } from 'decimal.js';
import type { FinanceItem, FinanceTerm } from './contracts.js';

// An isolated decimal context prevents another module changing financial precision.
export const Money = Decimal.clone({
  precision: 60,
  rounding: Decimal.ROUND_HALF_UP,
});
export const money = (value: Decimal.Value) => new Money(value);
export const amount = (value: Decimal) => value.toDecimalPlaces(6).toFixed();
export const valuationPolicy = 'ESTIMATE_V1' as const;
export type EstimateStage =
  'CONTRACTED_ESTIMATE' | 'ACCRUED_ESTIMATE' | 'COMPLETED_ESTIMATE';
export interface Estimate {
  valuationPolicy: typeof valuationPolicy;
  valueType: EstimateStage | 'FIXED' | 'MANUAL';
  stage: EstimateStage;
  from: number;
  to: number;
  currency: string;
  amount: string;
}
const unitMs = {
  HOURLY: 3600000,
  DAILY: 86400000,
  WEEKLY: 604800000,
  MONTHLY: 2592000000,
};
export function interval(
  start: string | null,
  end: string | null,
): [number, number] | null {
  if (!start || !end) return null;
  const a = Date.parse(start),
    b = Date.parse(end);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? [a, b] : null;
}
export function estimateAmount(
  rate: string,
  unit: FinanceTerm['rateUnit'],
  from: number,
  to: number,
  quantity = 1,
): string {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    to < from ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    !/^\d+(\.\d+)?$/.test(rate)
  )
    throw Error('Invalid estimate input');
  if (unit === 'FIXED_PERIOD' || unit === 'MANUAL') return amount(money(rate));
  if (!(unit in unitMs)) throw Error('Invalid rate unit');
  return amount(
    money(rate)
      .mul(money(to).minus(from).div(unitMs[unit]).ceil())
      .mul(quantity),
  );
}
export function lineEstimates(
  item: FinanceItem,
  status: string,
  now: number,
): { estimates: Estimate[]; unavailable: boolean } {
  const planned = interval(item.plannedStartAt, item.plannedEndAt);
  if (status === 'CANCELLED')
    return {
      estimates:
        planned && item.currency
          ? [
              {
                valuationPolicy,
                valueType: 'COMPLETED_ESTIMATE',
                stage: 'COMPLETED_ESTIMATE',
                from: planned[0],
                to: planned[1],
                currency: item.currency,
                amount: '0',
              },
            ]
          : [],
      unavailable: false,
    };
  if (!planned || !item.agreedRate || !item.rateUnit || !item.currency)
    return { estimates: [], unavailable: true };
  const terms: FinanceTerm[] = item.terms.length
    ? item.terms
    : [
        {
          plannedStartAt: item.plannedStartAt!,
          plannedEndAt: item.plannedEndAt!,
          agreedRate: item.agreedRate,
          rateUnit: item.rateUnit,
          currency: item.currency,
        },
      ];
  const sorted = [...terms].sort(
    (a, b) => Date.parse(a.plannedStartAt) - Date.parse(b.plannedStartAt),
  );
  const fixed = sorted.some((t) =>
    ['FIXED_PERIOD', 'MANUAL'].includes(t.rateUnit),
  );
  // A switch between fixed/manual and timed agreements has no approved conversion policy.
  if (
    fixed &&
    sorted.some(
      (t) =>
        t.rateUnit !== sorted[0]!.rateUnit ||
        t.currency !== sorted[0]!.currency,
    )
  )
    return { estimates: [], unavailable: true };
  const windows: { stage: EstimateStage; range: [number, number] }[] = [
    { stage: 'CONTRACTED_ESTIMATE', range: planned },
  ];
  const actual = item.assignments.filter((a) => a.actualStartAt);
  if (['ACTIVE', 'COMPLETED'].includes(status)) {
    if (
      !actual.length ||
      (status === 'COMPLETED' && actual.some((a) => !a.actualEndAt))
    )
      return { estimates: [], unavailable: true };
    const start = Math.min(...actual.map((a) => Date.parse(a.actualStartAt!)));
    const end =
      status === 'ACTIVE'
        ? now
        : Math.max(...actual.map((a) => Date.parse(a.actualEndAt!)));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
      return { estimates: [], unavailable: true };
    windows.push({
      stage: status === 'ACTIVE' ? 'ACCRUED_ESTIMATE' : 'COMPLETED_ESTIMATE',
      range: [start, end],
    });
  }
  const estimates: Estimate[] = [];
  for (const {
    stage,
    range: [from, to],
  } of windows) {
    if (fixed) {
      const t = sorted.at(-1)!;
      estimates.push({
        valuationPolicy,
        valueType: t.rateUnit === 'MANUAL' ? 'MANUAL' : 'FIXED',
        stage,
        from,
        to,
        currency: t.currency,
        amount: estimateAmount(
          t.agreedRate,
          t.rateUnit,
          from,
          to,
          item.quantity,
        ),
      });
      continue;
    }
    // Merge unchanged extensions before rounding: a date extension alone is not a new charge.
    const segments: { term: FinanceTerm; from: number; to: number }[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i]!;
      const a = Math.max(from, i === 0 ? from : Date.parse(t.plannedStartAt));
      const b = Math.min(
        to,
        i === sorted.length - 1
          ? to
          : Date.parse(sorted[i + 1]!.plannedStartAt),
      );
      if (b < a) continue;
      const previous = segments.at(-1);
      if (
        previous &&
        previous.to === a &&
        previous.term.agreedRate === t.agreedRate &&
        previous.term.rateUnit === t.rateUnit &&
        previous.term.currency === t.currency
      )
        previous.to = b;
      else segments.push({ term: t, from: a, to: b });
    }
    for (const s of segments)
      estimates.push({
        valuationPolicy,
        valueType: stage,
        stage,
        from: s.from,
        to: s.to,
        currency: s.term.currency,
        amount: estimateAmount(
          s.term.agreedRate,
          s.term.rateUnit,
          s.from,
          s.to,
          item.quantity,
        ),
      });
  }
  return { estimates, unavailable: false };
}
export function overlap(a: number, b: number, c: number, d: number): number {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}
export function unionMs(ranges: [number, number][]): number {
  let total = 0,
    end = -Infinity;
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    total += Math.max(0, b - Math.max(a, end));
    end = Math.max(end, b);
  }
  return total;
}
