import { createHash } from 'node:crypto';
import type {
  Attention,
  NotificationPreferences,
  OperationsDashboard,
} from '@rental/validation';
import type { OperationsSnapshot } from './contracts.js';

export function localDay(date: Date, timezone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${p['year']}-${p['month']}-${p['day']}`;
}
export function deriveOperations(
  s: OperationsSnapshot,
  org: string,
  permissions: readonly string[],
  prefs: NotificationPreferences,
  now: Date,
) {
  const today = localDay(now, s.timezone);
  const upcomingThrough = new Date(
    Date.parse(today + 'T12:00:00Z') + 7 * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const attention: Attention[] = [],
    timeline: Attention[] = [];
  const metrics: OperationsDashboard['metrics'] = [];
  const link = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}organizationId=${org}`;
  const count = (
    key: OperationsDashboard['metrics'][number]['key'],
    value: number,
    path: string,
  ) => metrics.push({ key, value, href: link(path) });
  const within = (at: Date) => {
    const day = localDay(at, s.timezone);
    return day >= today && day <= upcomingThrough;
  };
  function add(
    domain: Attention['domain'],
    kind: Attention['kind'],
    id: string,
    label: string,
    at: Date,
    path: string,
    severity: Attention['severity'],
    detail: string | null = null,
    occurrence = at.toISOString(),
  ) {
    const item: Attention = {
      key: createHash('sha256')
        .update(JSON.stringify([org, domain, kind, id, occurrence]))
        .digest('hex'),
      domain,
      kind,
      sourceId: id,
      label,
      detail,
      href: link(path),
      at: at.toISOString(),
      severity,
      readAt: null,
      acknowledgedAt: null,
      dismissedAt: null,
    };
    attention.push(item);
    if (
      domain !== 'TELEMETRY' &&
      within(at) &&
      !['SERVICE_BLOCKED', 'MAINTENANCE_IN_PROGRESS'].includes(kind)
    )
      timeline.push(item);
    return item;
  }
  if (permissions.includes('rentals.read')) {
    let overdue = 0,
      returns = 0,
      soon = 0;
    for (const r of s.rentals) {
      const pendingDispatch = r.items.filter(
        (i) => i.assignments.filter((a) => a.actualStartAt).length < i.quantity,
      );
      const start = pendingDispatch
        .flatMap((i) => (i.plannedStartAt ? [i.plannedStartAt] : []))
        .sort((a, b) => +a - +b)[0];
      if (start && within(start)) soon++;
      if (start && (start <= now || within(start)))
        add(
          'RENTAL',
          start <= now ? 'DISPATCH_DUE' : 'RESERVATION_SOON',
          r.id,
          r.number,
          start,
          `/rentals/${r.id}`,
          start <= now ? 'WARNING' : 'INFO',
        );
      const due = r.items
        .filter((i) =>
          i.assignments.some((a) => a.actualStartAt && !a.actualEndAt),
        )
        .flatMap((i) => (i.plannedEndAt ? [i.plannedEndAt] : []))
        .sort((a, b) => +a - +b)[0];
      if (due) {
        if (localDay(due, s.timezone) === today) returns++;
        if (due < now) {
          overdue++;
          add(
            'RENTAL',
            'RETURN_OVERDUE',
            r.id,
            r.number,
            due,
            `/rentals/${r.id}`,
            'HIGH',
          );
        } else if (within(due))
          add(
            'RENTAL',
            'RETURN_TODAY',
            r.id,
            r.number,
            due,
            `/rentals/${r.id}`,
            'INFO',
          );
      } else if (r.status === 'RESERVED') {
        const expected = r.items
          .flatMap((i) => (i.plannedEndAt ? [i.plannedEndAt] : []))
          .sort((a, b) => +a - +b)[0];
        if (expected && within(expected))
          add(
            'RENTAL',
            'RETURN_TODAY',
            r.id,
            r.number,
            expected,
            '/rentals/' + r.id,
            'INFO',
          );
      }
    }
    count(
      'activeRentals',
      s.rentals.filter((r) => r.status === 'ACTIVE').length,
      '/rentals?status=ACTIVE',
    );
    count('reservationsSoon', soon, '/dashboard?focus=reservationsSoon');
    count('returnsToday', returns, '/dashboard?focus=returnsToday');
    count('overdueRentals', overdue, '/dashboard?focus=overdueRentals');
  }
  if (permissions.includes('machines.read')) {
    const active = s.machines.filter((m) => m.lifecycleState === 'ACTIVE');
    count(
      'reservedMachines',
      active.filter((m) => m.rentalState === 'RESERVED').length,
      '/machines?rentalState=RESERVED',
    );
    count(
      'rentedMachines',
      active.filter((m) => m.rentalState === 'RENTED').length,
      '/machines?rentalState=RENTED',
    );
    if (s.available !== null)
      count('availableMachines', s.available, '/rentals');
  }
  if (permissions.includes('maintenance.read')) {
    count(
      'overdueMaintenance',
      s.orders.filter((w) => w.dueAt && w.dueAt < now).length,
      '/maintenance?overdue=true',
    );
    if (permissions.includes('machines.read'))
      count(
        'maintenanceMachines',
        s.machines.filter(
          (m) =>
            m.lifecycleState === 'ACTIVE' &&
            !['NORMAL', 'MAINTENANCE_DUE'].includes(m.serviceState),
        ).length,
        '/dashboard?focus=maintenanceMachines',
      );
    if (permissions.includes('machines.read'))
      for (const m of s.machines)
        if (
          m.lifecycleState === 'ACTIVE' &&
          !['NORMAL', 'MAINTENANCE_DUE'].includes(m.serviceState)
        )
          add(
            'MAINTENANCE',
            'SERVICE_BLOCKED',
            m.id,
            m.fleetNumber,
            m.serviceRestrictions
              ?.map((r) => r.createdAt)
              .sort((a, b) => +a - +b)[0] ?? m.updatedAt,
            '/machines/' + m.id,
            'WARNING',
            m.serviceState,
            `${m.serviceState}:${m.serviceRestrictions?.map((r) => r.id).join(',') ?? m.updatedAt.toISOString()}`,
          );
    for (const w of s.orders) {
      if (w.dueAt && (w.dueAt < now || within(w.dueAt)))
        add(
          'MAINTENANCE',
          w.dueAt < now ? 'MAINTENANCE_OVERDUE' : 'MAINTENANCE_DUE',
          w.id,
          w.number,
          w.dueAt,
          `/maintenance/${w.id}`,
          w.dueAt < now ? 'HIGH' : 'INFO',
          w.machine.fleetNumber,
        );
      if (w.plannedAt && w.status === 'PLANNED' && within(w.plannedAt))
        add(
          'MAINTENANCE',
          'MAINTENANCE_START',
          w.id,
          w.number,
          w.plannedAt,
          `/maintenance/${w.id}`,
          'INFO',
          w.machine.fleetNumber,
        );
      if (w.status === 'IN_PROGRESS' && w.startedAt)
        add(
          'MAINTENANCE',
          'MAINTENANCE_IN_PROGRESS',
          w.id,
          w.number,
          w.startedAt,
          `/maintenance/${w.id}`,
          'INFO',
          w.machine.fleetNumber,
        );
    }
    for (const p of s.plans)
      if (p.nextDueAt < now || within(p.nextDueAt))
        add(
          'MAINTENANCE',
          'PLAN_DUE',
          p.id,
          p.plan.name,
          p.nextDueAt,
          `/maintenance?machineId=${p.machineId}&tab=plans`,
          p.nextDueAt < now ? 'WARNING' : 'INFO',
          p.machine.fleetNumber,
        );
  }
  if (permissions.includes('telemetry.read')) {
    let offline = 0,
      faults = 0;
    for (const m of s.machines) {
      const state = s.telemetry.get(m.id);
      if (!state || m.lifecycleState !== 'ACTIVE') continue;
      const destination = permissions.includes('machines.read')
        ? `/machines/${m.id}`
        : `/machines/${m.id}/telemetry`;
      // Uninstalled devices/unknown telemetry do not generate an offline alert.
      if (
        state.installed &&
        state.connectivity === 'OFFLINE' &&
        state.lastUpdate
      ) {
        offline++;
        add(
          'TELEMETRY',
          'TELEMETRY_OFFLINE',
          m.id,
          m.fleetNumber,
          state.lastUpdate,
          destination,
          'WARNING',
        );
      }
      const soc = state.signals.find(
        (v) => v.signal === 'batterySoc' && !v.stale && v.healthy,
      );
      if (
        soc &&
        typeof soc.value === 'number' &&
        soc.value < prefs.lowSocPercent
      )
        add(
          'TELEMETRY',
          'LOW_BATTERY',
          m.id,
          m.fleetNumber,
          soc.recorded,
          destination,
          'WARNING',
          `${soc.value}%`,
          `${soc.device}:${prefs.lowSocPercent}:${localDay(soc.recorded, s.timezone)}`,
        );
      for (const f of permissions.includes('fault.read')
        ? (state.faults ?? [])
        : []) {
        faults++;
        add(
          'TELEMETRY',
          'TELEMETRY_FAULT',
          m.id,
          m.fleetNumber,
          f.first_seen,
          destination,
          f.severity === 'CRITICAL' ? 'HIGH' : 'WARNING',
          f.code,
          `${f.device}:${f.code}:${f.first_seen.toISOString()}:${f.occurrences}`,
        );
      }
    }
    count('offlineMachines', offline, '/dashboard?focus=offlineMachines');
    if (permissions.includes('fault.read'))
      count('activeFaults', faults, '/dashboard?focus=activeFaults');
  }
  const weight = { HIGH: 0, WARNING: 1, INFO: 2 };
  attention.sort(
    (a, b) =>
      weight[a.severity] - weight[b.severity] ||
      a.at.localeCompare(b.at) ||
      a.key.localeCompare(b.key),
  );
  timeline.sort(
    (a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key),
  );
  return {
    generatedAt: now.toISOString(),
    timezone: s.timezone,
    today,
    upcomingThrough,
    branches: s.branches,
    metrics,
    attention,
    timeline,
  };
}
