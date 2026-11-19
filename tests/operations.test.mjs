import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveOperations,
  localDay,
} from '../apps/api/dist/operations/attention.js';
import { notificationPreferencesSchema } from '../packages/validation/dist/index.js';
import { operationsEndpointAllowed } from '../packages/api-client/dist/index.js';
const now = new Date('2026-03-28T22:30:00Z'),
  org = '11111111-1111-4111-8111-111111111111';
const empty = () => ({
  timezone: 'Europe/Istanbul',
  branches: [],
  rentals: [],
  machines: [],
  orders: [],
  plans: [],
  telemetry: new Map(),
  available: null,
});
const preferences = notificationPreferencesSchema.parse({});
const derive = (
  s,
  p = [
    'rentals.read',
    'machines.read',
    'maintenance.read',
    'telemetry.read',
    'fault.read',
  ],
  time = now,
) => deriveOperations(s, org, p, preferences, time);
test('operations calendar days use tenant timezone across UTC midnight and DST changes', () => {
  assert.equal(localDay(now, 'Europe/Istanbul'), '2026-03-29');
  assert.equal(localDay(now, 'Europe/London'), '2026-03-28');
  assert.equal(derive(empty()).upcomingThrough, '2026-04-05');
});
test('operations partial returns exclude returned items but preserve the earliest outstanding deadline', () => {
  const s = empty();
  s.rentals = [
    {
      id: org,
      number: 'R-1',
      status: 'ACTIVE',
      items: [
        {
          id: 'a',
          quantity: 1,
          plannedStartAt: new Date(+now - 86400000),
          plannedEndAt: new Date(+now - 3600000),
          assignments: [
            {
              actualStartAt: new Date(+now - 7200000),
              actualEndAt: new Date(+now - 1000),
            },
          ],
        },
        {
          id: 'b',
          quantity: 1,
          plannedStartAt: new Date(+now - 86400000),
          plannedEndAt: new Date(+now + 3600000),
          assignments: [
            { actualStartAt: new Date(+now - 7200000), actualEndAt: null },
          ],
        },
      ],
    },
  ];
  let r = derive(s);
  assert.equal(r.metrics.find((m) => m.key === 'overdueRentals').value, 0);
  assert.equal(r.metrics.find((m) => m.key === 'returnsToday').value, 1);
  r = derive(s, undefined, new Date(+now + 7200000));
  assert.equal(r.metrics.find((m) => m.key === 'overdueRentals').value, 1);
});
test('operations recurrence keys change with extended due dates rather than carrying acknowledgement forward', () => {
  const s = empty();
  s.orders = [
    {
      id: org,
      number: 'WO-1',
      status: 'OPEN',
      dueAt: new Date(+now - 3600000),
      plannedAt: null,
      startedAt: null,
      machine: { fleetNumber: 'F-1' },
    },
  ];
  const first = derive(s).attention[0];
  s.orders[0].dueAt = new Date(+now - 1800000);
  const second = derive(s).attention[0];
  assert.notEqual(first.key, second.key);
  assert.match(first.href, /maintenance/);
});
test('operations unknown telemetry and uninstalled stale sources do not generate offline alerts', () => {
  const s = empty();
  s.machines = [
    {
      id: org,
      fleetNumber: 'F-1',
      lifecycleState: 'ACTIVE',
      rentalState: 'NOT_RENTED',
      serviceState: 'NORMAL',
      updatedAt: now,
    },
  ];
  s.telemetry.set(org, {
    connectivity: 'OFFLINE',
    lastUpdate: new Date(+now - 3600000),
    installed: false,
    signals: [],
  });
  assert.equal(derive(s).attention.length, 0);
  s.telemetry.set(org, {
    connectivity: 'UNKNOWN',
    lastUpdate: null,
    installed: true,
    signals: [],
  });
  assert.equal(derive(s).attention.length, 0);
});
test('operations low battery requires healthy fresh canonical SoC; zero is a real value', () => {
  const s = empty();
  s.machines = [
    {
      id: org,
      fleetNumber: 'F-1',
      lifecycleState: 'ACTIVE',
      rentalState: 'NOT_RENTED',
      serviceState: 'NORMAL',
      updatedAt: now,
    },
  ];
  const signal = {
    signal: 'batterySoc',
    value: 0,
    stale: false,
    healthy: true,
    recorded: now,
    device: org,
  };
  s.telemetry.set(org, {
    connectivity: 'ONLINE',
    lastUpdate: now,
    installed: true,
    signals: [signal],
  });
  assert.equal(derive(s).attention[0].kind, 'LOW_BATTERY');
  signal.stale = true;
  assert.equal(derive(s).attention.length, 0);
  signal.stale = false;
  signal.healthy = false;
  assert.equal(derive(s).attention.length, 0);
});
test('operations does not invent temperature thresholds or leak faults without source permission', () => {
  const s = empty();
  s.machines = [
    {
      id: org,
      fleetNumber: 'F-1',
      lifecycleState: 'ACTIVE',
      rentalState: 'NOT_RENTED',
      serviceState: 'NORMAL',
      updatedAt: now,
    },
  ];
  s.telemetry.set(org, {
    connectivity: 'ONLINE',
    lastUpdate: now,
    installed: true,
    signals: [
      {
        signal: 'batteryTemperature',
        value: 99,
        stale: false,
        healthy: true,
        recorded: now,
      },
    ],
    faults: [],
  });
  assert.equal(derive(s).attention.length, 0);
  s.telemetry.get(org).faults = [
    {
      code: 'VISIBLE_ONLY_WITH_FAULT_PERMISSION',
      device: org,
      first_seen: now,
      occurrences: 1,
      severity: 'CRITICAL',
    },
  ];
  assert.equal(derive(s, ['telemetry.read']).attention.length, 0);
  const alert = derive(s, ['telemetry.read', 'fault.read']).attention[0];
  assert.equal(alert.kind, 'TELEMETRY_FAULT');
  assert.equal(
    alert.href,
    '/machines/' + org + '/telemetry?organizationId=' + org,
  );
  assert.equal(derive(s, []).metrics.length, 0);
});
test('operations bridge only allows fixed read and interaction endpoints', () => {
  assert.ok(
    operationsEndpointAllowed('GET', `organizations/${org}/operations/search`),
  );
  assert.ok(
    operationsEndpointAllowed(
      'PATCH',
      `organizations/${org}/operations/notifications/${'a'.repeat(64)}`,
    ),
  );
  assert.equal(
    operationsEndpointAllowed('POST', `organizations/${org}/operations`),
    false,
  );
  assert.equal(
    operationsEndpointAllowed(
      'GET',
      `organizations/${org}/operations/../audit`,
    ),
    false,
  );
});

test('operations upcoming dispatch and preventive plan deadlines are read-only and do not block a normal machine', () => {
  const s = empty();
  s.machines = [
    {
      id: org,
      fleetNumber: 'F-1',
      lifecycleState: 'ACTIVE',
      rentalState: 'RESERVED',
      serviceState: 'NORMAL',
      updatedAt: now,
    },
  ];
  s.rentals = [
    {
      id: org,
      number: 'R-UPCOMING',
      status: 'RESERVED',
      items: [
        {
          id: org,
          quantity: 1,
          plannedStartAt: new Date(+now + 3600000),
          plannedEndAt: new Date(+now + 86400000),
          assignments: [],
        },
      ],
    },
  ];
  s.plans = [
    {
      id: org,
      machineId: org,
      nextDueAt: new Date(+now + 172800000),
      plan: { name: 'Future preventive plan' },
      machine: { fleetNumber: 'F-1' },
    },
  ];
  const before = structuredClone(s);
  const upcoming = derive(s);
  assert.equal(
    upcoming.metrics.find((m) => m.key === 'reservationsSoon').value,
    1,
  );
  assert.equal(
    upcoming.metrics.find((m) => m.key === 'maintenanceMachines').value,
    0,
  );
  assert.ok(upcoming.timeline.some((a) => a.kind === 'RESERVATION_SOON'));
  assert.ok(upcoming.timeline.some((a) => a.kind === 'PLAN_DUE'));
  const due = derive(s, undefined, new Date(+now + 7200000));
  assert.equal(
    due.attention.find((a) => a.kind === 'DISPATCH_DUE').severity,
    'WARNING',
  );
  assert.deepEqual(s, before);
});
