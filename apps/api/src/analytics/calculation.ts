import type {
  AnalyticsMoney,
  AnalyticsQuery,
  AnalyticsReport,
  AnalyticsRow,
} from '@rental/validation';
import type {
  FinanceMachine,
  FinanceRental,
  FinanceSnapshot,
  FinanceVisibility,
} from './contracts.js';
import {
  Money,
  amount,
  interval,
  lineEstimates,
  money,
  overlap,
  unionMs,
  valuationPolicy,
  type Estimate,
} from './valuation.js';
import { monthRanges } from './period.js';
import { transportSummary } from './transportation.js';

type Metric =
  | 'estimatedContractedValue'
  | 'estimatedAccruedValue'
  | 'estimatedCompletedValue'
  | 'maintenanceCost';
interface Event {
  machineId: string | null;
  customerId: string | null;
  rentalId: string | null;
  from: number;
  to: number;
  currency: string;
  amount: string;
  metric: Metric;
  valueType?: Estimate['valueType'];
}
const keyFor = (stage: Estimate['stage']): Metric =>
  stage === 'CONTRACTED_ESTIMATE'
    ? 'estimatedContractedValue'
    : stage === 'ACCRUED_ESTIMATE'
      ? 'estimatedAccruedValue'
      : 'estimatedCompletedValue';
function sum(
  events: Event[],
  v: FinanceVisibility,
  from: number,
  to: number,
): AnalyticsMoney[] {
  const currencies = new Map<string, AnalyticsMoney>();
  for (const e of events) {
    const included =
      e.to === e.from
        ? e.from >= from && e.from < to
          ? 1
          : 0
        : overlap(e.from, e.to, from, to);
    if (!included) continue;
    let value = currencies.get(e.currency);
    if (!value) {
      value = {
        currency: e.currency,
        ...(v.pricing
          ? {
              estimatedContractedValue: '0',
              estimatedAccruedValue: '0',
              estimatedCompletedValue: '0',
              valueTypes: [],
            }
          : {}),
        ...(v.costs ? { maintenanceCost: '0' } : {}),
      };
      currencies.set(e.currency, value);
    }
    // Division happens in Decimal, not binary floating point, for authoritative estimates.
    const fraction =
      e.to === e.from
        ? money(1)
        : money(overlap(e.from, e.to, from, to)).div(e.to - e.from);
    value[e.metric] = money(value[e.metric] ?? '0')
      .plus(money(e.amount).mul(fraction))
      .toFixed();
    if (e.valueType && !value.valueTypes?.includes(e.valueType))
      value.valueTypes?.push(e.valueType);
  }
  for (const v1 of currencies.values()) {
    for (const key of [
      'estimatedContractedValue',
      'estimatedAccruedValue',
      'estimatedCompletedValue',
      'maintenanceCost',
    ] as const)
      if (v1[key] !== undefined) v1[key] = amount(money(v1[key]!));
    if (v.pricing && v.costs)
      v1.estimatedContribution = amount(
        money(v1.estimatedCompletedValue ?? '0').minus(
          v1.maintenanceCost ?? '0',
        ),
      );
  }
  return [...currencies.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}
function acquisition(machines: FinanceMachine[]) {
  const totals = new Map<string, ReturnType<typeof money>>();
  for (const m of machines)
    if (
      m.acquisitionCost !== null &&
      m.acquisitionCost !== undefined &&
      m.currency
    )
      totals.set(
        m.currency,
        (totals.get(m.currency) ?? money(0)).plus(m.acquisitionCost),
      );
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, n]) => ({ currency, amount: amount(n) }));
}
export function calculateReport(
  data: FinanceSnapshot,
  q: AnalyticsQuery,
  v: FinanceVisibility,
  range: [number, number],
  now: Date,
  timezone: string,
  completeTenantScope = true,
): AnalyticsReport {
  const [from, to] = range,
    asOf = now.getTime(),
    machinesById = new Map(data.machines.map((m) => [m.id, m])),
    machineIds = new Set(machinesById.keys());
  const events: Event[] = [];
  function allocate(
    base: Omit<Event, 'machineId' | 'amount' | 'from' | 'to'>,
    total: string,
    parts: {
      machineId: string | null;
      weight: number;
      from: number;
      to: number;
    }[],
  ) {
    const denominator = parts.reduce((n, p) => n + p.weight, 0);
    if (!denominator) return;
    let allocated = money(0);
    parts.forEach((p, index) => {
      const value =
        index === parts.length - 1
          ? money(total).minus(allocated)
          : money(amount(money(total).mul(p.weight).div(denominator)));
      allocated = allocated.plus(value);
      if (
        (p.machineId && machineIds.has(p.machineId)) ||
        (!p.machineId && !q.machineId && !q.modelId && !q.categoryId)
      )
        events.push({
          ...base,
          machineId: p.machineId,
          from: p.from,
          to: p.to,
          amount: amount(value),
        });
    });
  }
  const unavailableMachines = new Set<string>();
  let unavailableEstimates = 0;
  for (const r of data.rentals)
    for (const item of r.items) {
      if (!v.pricing) continue;
      const result = lineEstimates(item, r.status, asOf);
      if (result.unavailable) {
        unavailableEstimates++;
        for (const a of item.assignments) unavailableMachines.add(a.machineId);
      }
      for (const e of result.estimates) {
        const base = {
          customerId: r.customerId,
          rentalId: r.id,
          from: e.from,
          to: e.to,
          currency: e.currency,
          metric: keyFor(e.stage),
          valueType: e.valueType,
        };
        if (e.stage === 'CONTRACTED_ESTIMATE' || r.status === 'CANCELLED') {
          const assigned = item.assignments.filter((a) => !a.releasedAt);
          const missing = Math.max(0, item.quantity - assigned.length);
          allocate(base, e.amount, [
            ...assigned.map((a) => ({
              machineId: a.machineId,
              weight: 1,
              from: e.from,
              to: e.to,
            })),
            ...(missing
              ? [{ machineId: null, weight: missing, from: e.from, to: e.to }]
              : []),
          ]);
        } else {
          const spans = item.assignments.flatMap((a) => {
            const span = interval(
              a.actualStartAt,
              a.actualEndAt ?? now.toISOString(),
            );
            if (!span) return [];
            const a1 = Math.max(span[0], e.from),
              b1 = Math.min(span[1], e.to);
            return b1 > a1 ? [{ a, from: a1, to: b1, duration: b1 - a1 }] : [];
          });
          allocate(
            base,
            e.amount,
            spans.length
              ? spans.map((s) => ({
                  machineId: s.a.machineId,
                  weight: s.duration,
                  from: s.from,
                  to: s.to,
                }))
              : item.assignments
                  .filter((a) => !!a.actualStartAt)
                  .map((a) => ({
                    machineId: a.machineId,
                    weight: 1,
                    from: e.from,
                    to: e.to,
                  })),
          );
        }
      }
    }
  for (const wo of data.workOrders)
    if (wo.status !== 'CANCELLED' && v.costs && machineIds.has(wo.machineId))
      for (const cost of wo.costs)
        events.push({
          machineId: wo.machineId,
          customerId: null,
          rentalId: null,
          from: Date.parse(wo.occurredAt),
          to: Date.parse(wo.occurredAt),
          currency: cost.currency,
          amount: cost.amount,
          metric: 'maintenanceCost',
        });

  const machinePeriods = new Map<
    string,
    {
      customerId: string;
      actual: [number, number] | null;
      planned: [number, number] | null;
    }[]
  >();
  for (const r of data.rentals)
    for (const i of r.items)
      for (const a of i.assignments) {
        const rows = machinePeriods.get(a.machineId) ?? [];
        rows.push({
          customerId: r.customerId,
          actual:
            r.status === 'CANCELLED'
              ? null
              : interval(a.actualStartAt, a.actualEndAt ?? now.toISOString()),
          planned:
            !a.releasedAt &&
            !a.actualStartAt &&
            ['RESERVED', 'ACTIVE'].includes(r.status)
              ? interval(i.plannedStartAt, i.plannedEndAt)
              : null,
        });
        machinePeriods.set(a.machineId, rows);
      }
  function utilization(
    machines: FinanceMachine[],
    a: number,
    b: number,
    customerId?: string,
  ): AnalyticsRow['utilization'] {
    let observation = 0,
      rented = 0,
      reserved = 0,
      excluded = 0;
    for (const m of machines) {
      const start = Math.max(a, Date.parse(m.acquisitionDate ?? m.createdAt)),
        end = Math.min(b, asOf);
      if (m.lifecycleState !== 'ACTIVE' || end <= start) {
        excluded++;
        continue;
      }
      observation += end - start;
      const actual: [number, number][] = [],
        planned: [number, number][] = [];
      for (const entry of machinePeriods.get(m.id) ?? [])
        if (!customerId || entry.customerId === customerId) {
          const range = entry.actual;
          if (range && overlap(...range, start, end))
            actual.push([Math.max(start, range[0]), Math.min(end, range[1])]);
          const booked = entry.planned;
          if (booked && overlap(...booked, start, end))
            planned.push([
              Math.max(start, booked[0]),
              Math.min(end, booked[1]),
            ]);
        }
      rented += unionMs(actual);
      reserved += unionMs(planned);
    }
    return {
      observationSeconds: observation / 1000,
      rentedSeconds: rented / 1000,
      reservedSeconds: reserved / 1000,
      unrentedSeconds: Math.max(0, observation - rented) / 1000,
      percentage:
        v.rentals && observation
          ? amount(money(rented).div(observation).mul(100))
          : null,
      excludedMachines: excluded,
    };
  }
  function row(
    id: string,
    label: string,
    machines: FinanceMachine[],
    subset: Event[],
    customerId?: string,
  ): AnalyticsRow {
    const ids = new Set(machines.map((m) => m.id));
    const candidates =
      id === 'summary'
        ? data.rentals
        : customerId
          ? (rentalsByCustomer.get(customerId) ?? [])
          : [
              ...new Set(
                machines.flatMap((m) => rentalsByMachine.get(m.id) ?? []),
              ),
            ];
    const related = candidates.filter(
      (r) =>
        (!customerId || r.customerId === customerId) &&
        r.items.some((i) => {
          const span = interval(i.plannedStartAt, i.plannedEndAt);
          const relevant =
            (span && overlap(...span, from, to)) ||
            i.assignments.some((a) => {
              const s = interval(
                a.actualStartAt,
                a.actualEndAt ?? now.toISOString(),
              );
              return s && overlap(...s, from, to);
            });
          return (
            relevant &&
            (id === 'summary' ||
              customerId ||
              i.assignments.some((a) => ids.has(a.machineId)))
          );
        }),
    );
    const durations = related
      .filter((r) => r.status === 'COMPLETED')
      .flatMap((r) => {
        const assignments = r.items
          .flatMap((i) => i.assignments)
          .filter((a) => a.actualStartAt && a.actualEndAt);
        return assignments.length
          ? [
              (Math.max(...assignments.map((a) => Date.parse(a.actualEndAt!))) -
                Math.min(
                  ...assignments.map((a) => Date.parse(a.actualStartAt!)),
                )) /
                1000,
            ]
          : [];
      });
    const values = sum(subset, v, from, to);
    const costs =
      v.acquisition && !customerId
        ? acquisition(
            machines.filter(
              (m) => id !== 'summary' || m.lifecycleState === 'ACTIVE',
            ),
          )
        : undefined;
    const result: AnalyticsRow = {
      id,
      label,
      machineCount: machines.length,
      rentalCount: related.length,
      activeRentals: related.filter((r) => r.status === 'ACTIVE').length,
      values,
      mixedCurrencies:
        new Set([
          ...values.map((x) => x.currency),
          ...(costs ?? []).map((x) => x.currency),
        ]).size > 1,
      utilization: utilization(machines, from, to, customerId),
      averageRentalSeconds: durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null,
      ...(costs ? { acquisitionCost: costs } : {}),
    };
    if (
      q.group === 'machine' &&
      id !== 'summary' &&
      !customerId &&
      !q.customerId &&
      !q.status &&
      !q.branchId &&
      completeTenantScope
    ) {
      const lifetime = sum(subset, v, -8640000000000000, asOf + 1);
      result.lifetime = { values: lifetime };
      if (v.acquisition && v.pricing && v.costs) {
        const m = machines[0]!,
          foreign = lifetime.some(
            (n) =>
              n.currency !== m.currency &&
              (money(n.estimatedCompletedValue ?? '0').gt(0) ||
                money(n.maintenanceCost ?? '0').gt(0)),
          );
        result.lifetime.recovery = null;
        if (
          m.currency &&
          m.acquisitionCost !== null &&
          m.acquisitionCost !== undefined &&
          !foreign &&
          !unavailableMachines.has(m.id)
        ) {
          const contribution = money(
              lifetime.find((n) => n.currency === m.currency)
                ?.estimatedContribution ?? '0',
            ),
            price = money(m.acquisitionCost);
          result.lifetime.recovery = {
            currency: m.currency,
            contribution: amount(contribution),
            percentage: price.gt(0)
              ? amount(contribution.div(price).mul(100))
              : null,
            remaining: price.gt(0)
              ? amount(Money.max(price.minus(contribution), 0))
              : null,
            recovered: price.gt(0) ? contribution.gte(price) : null,
          };
        }
      }
    }
    return result;
  }
  const groups = new Map<
    string,
    { label: string; machines: FinanceMachine[]; customerId?: string }
  >();
  // Index bulk source reads once; grouped reports do not rescan every rental/event per machine.
  const rentalsByMachine = new Map<string, FinanceRental[]>(),
    rentalsByCustomer = new Map<string, FinanceRental[]>();
  for (const r of data.rentals) {
    rentalsByCustomer.set(r.customerId, [
      ...(rentalsByCustomer.get(r.customerId) ?? []),
      r,
    ]);
    for (const id of new Set(
      r.items.flatMap((i) => i.assignments.map((a) => a.machineId)),
    ))
      rentalsByMachine.set(id, [...(rentalsByMachine.get(id) ?? []), r]);
  }
  const eventsByMachine = new Map<string, Event[]>(),
    eventsByCustomer = new Map<string, Event[]>();
  for (const e of events) {
    if (e.machineId) {
      const list = eventsByMachine.get(e.machineId) ?? [];
      list.push(e);
      eventsByMachine.set(e.machineId, list);
    }
    if (e.customerId) {
      const list = eventsByCustomer.get(e.customerId) ?? [];
      list.push(e);
      eventsByCustomer.set(e.customerId, list);
    }
  }
  if (q.group === 'customer')
    for (const r of data.rentals) {
      const ids = new Set(
        r.items.flatMap((i) => i.assignments.map((a) => a.machineId)),
      );
      const old = groups.get(r.customerId);
      groups.set(r.customerId, {
        label: r.customer,
        customerId: r.customerId,
        machines: [
          ...new Set([
            ...(old?.machines ?? []),
            ...Array.from(ids).flatMap((id) => {
              const m = machinesById.get(id);
              return m ? [m] : [];
            }),
          ]),
        ],
      });
    }
  else
    for (const m of data.machines) {
      const id =
        q.group === 'machine'
          ? m.id
          : q.group === 'model'
            ? m.modelId
            : q.group === 'category'
              ? m.categoryId
              : (m.branchId ?? 'UNASSIGNED');
      const label =
        q.group === 'machine'
          ? m.fleetNumber + ' · ' + m.model
          : q.group === 'model'
            ? m.model
            : q.group === 'category'
              ? m.category
              : (m.branch ?? 'UNASSIGNED');
      const group = groups.get(id) ?? { label, machines: [] };
      group.machines.push(m);
      groups.set(id, group);
    }
  const rows = [...groups].map(([id, g]) => {
    return row(
      id,
      g.label,
      g.machines,
      g.customerId
        ? (eventsByCustomer.get(g.customerId) ?? [])
        : g.machines.flatMap((m) => eventsByMachine.get(m.id) ?? []),
      g.customerId,
    );
  });
  const rank = (r: AnalyticsRow) =>
    q.sort === 'COMPLETED_VALUE'
      ? (r.values.find((x) => x.currency === q.sortCurrency)
          ?.estimatedCompletedValue ?? '0')
      : q.sort === 'UTILIZATION'
        ? (r.utilization.percentage ?? '-1')
        : r.utilization.unrentedSeconds;
  rows.sort(
    (a, b) =>
      (q.sort === 'ID' ? 0 : money(rank(b)).comparedTo(rank(a))) ||
      a.id.localeCompare(b.id),
  );
  const cursorIndex = q.cursor ? rows.findIndex((r) => r.id === q.cursor) : -1;
  const page = rows.slice(
    q.cursor && cursorIndex < 0 ? rows.length : cursorIndex + 1,
  );
  const items = page.slice(0, q.limit);
  return {
    valuationPolicy,
    generatedAt: now.toISOString(),
    timezone,
    period: {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    },
    visibility: v,
    ...((v.pricing || v.transportCosts) &&
    !q.machineId &&
    !q.modelId &&
    !q.categoryId
      ? { transportation: transportSummary(data.rentals, v, from, to) }
      : {}),
    summary: row('summary', 'summary', data.machines, events),
    machinesRented: data.machines.filter((m) => m.rentalState === 'RENTED')
      .length,
    machinesUnderMaintenance: v.maintenance
      ? data.machines.filter((m) => m.serviceState !== 'NORMAL').length
      : 0,
    items,
    nextCursor: page.length > q.limit ? items.at(-1)!.id : null,
    trends: monthRanges(from, to, timezone).map(([a, b]) => ({
      from: new Date(a).toISOString(),
      to: new Date(b).toISOString(),
      values: sum(events, v, a, b),
      utilization: utilization(data.machines, a, b),
    })),
    ...(v.pricing
      ? {
          unavailableEstimates,
          unallocatedValues: sum(
            events.filter((e) => !e.machineId),
            v,
            from,
            to,
          ),
        }
      : {}),
  };
}
