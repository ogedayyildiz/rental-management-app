import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { MaintenanceService } from '../apps/api/dist/maintenance/maintenance.service.js';
import { PrismaMaintenanceUnitOfWork } from '../apps/api/dist/infrastructure/prisma.maintenance.js';
import { MachineService } from '../apps/api/dist/machines/machine.service.js';
import { PrismaMachineUnitOfWork } from '../apps/api/dist/infrastructure/prisma.machines.js';
import { tenantPermissions } from '../packages/permissions/dist/index.js';
export async function maintenanceCases(suite, db, fixture, h) {
  const unit = new PrismaMaintenanceUnitOfWork(db),
    service = new MaintenanceService(
      unit,
      () => new Date('2030-06-10T12:00:00Z'),
    ),
    machines = new MachineService(new PrismaMachineUnitOfWork(db));
  async function tenant() {
    const t = await fixture();
    await db.rolePermission.createMany({
      data: tenantPermissions
        .filter(
          (k) => k.startsWith('maintenance.') || k.startsWith('machines.'),
        )
        .map((permissionKey) => ({
          organizationId: t.organization.id,
          roleId: t.role.id,
          permissionKey,
        })),
      skipDuplicates: true,
    });
    t.machine = await machines.create(
      t.principal,
      t.organization.id,
      {
        fleetNumber: randomUUID(),
        manufacturer: 'Test',
        model: 'Lift',
        category: 'Lift',
        branchId: t.branch.id,
      },
      randomUUID(),
    );
    return t;
  }
  const create = (t, extra = {}) =>
    service.create(
      t.principal,
      t.organization.id,
      {
        machineId: t.machine.id,
        branchId: t.branch.id,
        type: 'PREVENTIVE',
        title: 'Service',
        dueAt: '2030-06-09T00:00:00Z',
        ...extra,
      },
      randomUUID(),
    );
  const action = (t, row, a, body = {}) =>
    service.transition(
      t.principal,
      t.organization.id,
      row.id,
      a,
      body,
      randomUUID(),
    );
  const state = async (t) =>
    (await db.machine.findUniqueOrThrow({ where: { id: t.machine.id } }))
      .serviceState;
  await suite.test(
    'maintenance workflow, checklist, return-independent completion and exact costs',
    async () => {
      const t = await tenant();
      let row = await create(t, {
        impact: 'WARNING',
        checklist: ['Inspect safety controls'],
      });
      assert.equal(row.overdue, true);
      row = await action(t, row, 'open');
      assert.equal(await state(t), 'MAINTENANCE_DUE');
      row = await action(t, row, 'start');
      assert.equal(await state(t), 'OUT_OF_SERVICE');
      await assert.rejects(action(t, row, 'complete', { notes: 'Done' }), {
        code: 'INVALID_INPUT',
      });
      await service.mutateChild(
        t.principal,
        t.organization.id,
        row.id,
        'task',
        { completed: true },
        randomUUID(),
        row.tasks[0].id,
      );
      row = await service.mutateChild(
        t.principal,
        t.organization.id,
        row.id,
        'cost',
        {
          kind: 'LABOR',
          amount: '123.123456',
          tax: { mode: 'EXCLUSIVE', rate: '0' },
          currency: 'TRY',
        },
        randomUUID(),
      );
      assert.equal(row.costs[0].amount, '123.123456');
      row = await action(t, row, 'complete', { notes: 'Tested and safe' });
      assert.equal(row.status, 'COMPLETED');
      assert.equal(await state(t), 'NORMAL');
      await action(t, row, 'complete', {});
      assert.equal(
        await db.auditEvent.count({
          where: { targetId: row.id, action: 'MAINTENANCE_COMPLETED' },
        }),
        1,
      );
      await assert.rejects(action(t, row, 'start'), {
        code: 'INVALID_TRANSITION',
      });
    },
  );
  await suite.test(
    'maintenance completion preserves other work orders and manual restrictions',
    async () => {
      const t = await tenant();
      let a = await create(t, { impact: 'RENTAL_BLOCKING' }),
        b = await create(t, { impact: 'SAFETY_CRITICAL' });
      a = await action(t, a, 'open');
      b = await action(t, b, 'open');
      await action(t, a, 'start');
      await action(t, a, 'complete', { notes: 'Finished' });
      assert.equal(await state(t), 'SERVICE_BLOCKED');
      const manual = await service.block(
        t.principal,
        t.organization.id,
        t.machine.id,
        { state: 'OUT_OF_SERVICE', reason: 'Separate issue' },
        randomUUID(),
      );
      await action(t, b, 'cancel', { reason: 'Duplicate report resolved' });
      assert.equal(await state(t), 'OUT_OF_SERVICE');
      await assert.rejects(
        machines.update(
          t.principal,
          t.organization.id,
          t.machine.id,
          { serviceState: 'NORMAL' },
          randomUUID(),
        ),
        { code: 'INVALID_INPUT' },
      );
      await service.release(
        t.principal,
        t.organization.id,
        t.machine.id,
        manual.id,
        { reason: 'Verified repaired' },
        randomUUID(),
      );
      assert.equal(await state(t), 'NORMAL');
    },
  );
  await suite.test(
    'maintenance tenant, branch, membership and permission boundaries',
    async () => {
      const a = await tenant(),
        b = await tenant(),
        row = await create(a);
      await assert.rejects(
        service.get(b.principal, a.organization.id, row.id),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(create(b, { machineId: a.machine.id }), {
        code: 'NOT_FOUND',
      });
      await assert.rejects(create(a, { branchId: b.branch.id }), {
        code: 'NOT_FOUND',
      });
      await db.membership.update({
        where: { id: a.membership.id },
        data: { branchScope: 'SELECTED_BRANCHES' },
      });
      assert.equal(
        (await service.list(a.principal, a.organization.id, {})).items.length,
        0,
      );
      await assert.rejects(
        service.get(a.principal, a.organization.id, row.id),
        { code: 'NOT_FOUND' },
      );
      await db.membershipBranch.create({
        data: {
          organizationId: a.organization.id,
          membershipId: a.membership.id,
          branchId: a.branch.id,
        },
      });
      assert.equal(
        (await service.get(a.principal, a.organization.id, row.id)).id,
        row.id,
      );
      await db.rolePermission.deleteMany({
        where: {
          organizationId: a.organization.id,
          permissionKey: 'maintenance.create',
        },
      });
      await assert.rejects(create(a), { code: 'ACCESS_DENIED' });
    },
  );
  await suite.test(
    'maintenance rented and retired machine transitions do not modify rental state',
    async () => {
      const t = await tenant();
      await db.machine.update({
        where: { id: t.machine.id },
        data: { rentalState: 'RENTED' },
      });
      let row = await create(t, { impact: 'RENTAL_BLOCKING' });
      row = await action(t, row, 'open');
      await assert.rejects(action(t, row, 'start'), {
        code: 'MACHINE_COMMITTED',
      });
      assert.equal(
        (await db.machine.findUniqueOrThrow({ where: { id: t.machine.id } }))
          .rentalState,
        'RENTED',
      );
      await db.machine.update({
        where: { id: t.machine.id },
        data: { rentalState: 'NOT_RENTED', lifecycleState: 'RETIRED' },
      });
      await assert.rejects(create(t), { code: 'MACHINE_ARCHIVED' });
      await action(t, row, 'cancel', { reason: 'Retired' });
      assert.equal(
        (await service.get(t.principal, t.organization.id, row.id)).status,
        'CANCELLED',
      );
    },
  );
  await suite.test(
    'maintenance cost permissions redact reads and prohibit writes',
    async () => {
      const t = await tenant(),
        row = await create(t);
      await service.mutateChild(
        t.principal,
        t.organization.id,
        row.id,
        'cost',
        {
          kind: 'PARTS',
          amount: '42',
          tax: { mode: 'EXCLUSIVE', rate: '0' },
          currency: 'EUR',
        },
        randomUUID(),
      );
      await db.rolePermission.deleteMany({
        where: {
          organizationId: t.organization.id,
          permissionKey: {
            in: ['maintenance.costs.view', 'maintenance.costs.edit'],
          },
        },
      });
      assert.equal(
        'costs' in (await service.get(t.principal, t.organization.id, row.id)),
        false,
      );
      assert.equal(
        'costs' in
          (await service.list(t.principal, t.organization.id, {})).items[0],
        false,
      );
      await assert.rejects(
        service.mutateChild(
          t.principal,
          t.organization.id,
          row.id,
          'cost',
          {
            kind: 'PARTS',
            amount: '1',
            tax: { mode: 'EXCLUSIVE', rate: '0' },
            currency: 'TRY',
          },
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
    },
  );
  await suite.test(
    'maintenance audit failure rolls back state and restrictions',
    async () => {
      const t = await tenant(),
        row = await create(t, { impact: 'SAFETY_CRITICAL' });
      const broken = new MaintenanceService({
        run: (work) =>
          unit.run((r) =>
            work({
              ...r,
              audit: {
                append: async () => {
                  throw Error('audit unavailable');
                },
              },
            }),
          ),
      });
      await assert.rejects(
        broken.transition(
          t.principal,
          t.organization.id,
          row.id,
          'open',
          {},
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(
        (await service.get(t.principal, t.organization.id, row.id)).status,
        'DRAFT',
      );
      assert.equal(await state(t), 'NORMAL');
      assert.equal(
        await db.serviceRestriction.count({
          where: { organizationId: t.organization.id },
        }),
        0,
      );
    },
  );
  await suite.test(
    'maintenance cursor, overdue and concurrent numbering',
    async () => {
      const t = await tenant();
      await create(t);
      const outcomes = await Promise.allSettled([create(t), create(t)]);
      assert.ok(outcomes.some((x) => x.status === 'fulfilled'));
      for (const x of outcomes)
        if (x.status === 'rejected') assert.equal(x.reason.code, 'CONFLICT');
      const all = await service.list(t.principal, t.organization.id, {
        overdue: 'true',
      });
      assert.equal(
        new Set(all.items.map((x) => x.number)).size,
        all.items.length,
      );
      const first = await service.list(t.principal, t.organization.id, {
          limit: '1',
        }),
        second = await service.list(t.principal, t.organization.id, {
          limit: '1',
          cursor: first.nextCursor,
        });
      assert.notEqual(first.items[0].id, second.items[0].id);
    },
  );
  await suite.test(
    'maintenance materials and invalid dates are validated without inventory',
    async () => {
      const t = await tenant(),
        row = await create(t);
      await assert.rejects(
        create(t, {
          plannedAt: '2030-01-02T00:00:00Z',
          plannedEndAt: '2030-01-01T00:00:00Z',
        }),
        { code: 'INVALID_INPUT' },
      );
      await assert.rejects(
        service.mutateChild(
          t.principal,
          t.organization.id,
          row.id,
          'material',
          { description: 'Filter', quantity: '-1', unit: 'each' },
          randomUUID(),
        ),
        { code: 'INVALID_INPUT' },
      );
      const updated = await service.mutateChild(
        t.principal,
        t.organization.id,
        row.id,
        'material',
        { description: 'Filter', quantity: '1.5', unit: 'litre' },
        randomUUID(),
      );
      assert.equal(updated.materials[0].quantity, '1.5');
    },
  );
  await suite.test(
    'calendar plans preserve interval policy and advance exactly once; partial edits preserve fields',
    async () => {
      const t = await tenant();
      const plan = await service.savePlan(
        t.principal,
        t.organization.id,
        null,
        {
          name: 'Monthly inspection',
          type: 'INSPECTION',
          interval: 1,
          intervalUnit: 'MONTHS',
          intervalBasis: 'SCHEDULED',
        },
        randomUUID(),
      );
      const schedule = await service.saveSchedule(
        t.principal,
        t.organization.id,
        {
          machineId: t.machine.id,
          planId: plan.id,
          nextDueAt: '2030-01-31T12:00:00Z',
        },
        randomUUID(),
      );
      let row = await create(t, {
        machinePlanId: schedule.id,
        impact: 'WARNING',
        technicianNotes: 'Preserve this',
        priority: 'HIGH',
      });
      await assert.rejects(create(t, { machinePlanId: schedule.id }), {
        code: 'CONFLICT',
      });
      row = await service.update(
        t.principal,
        t.organization.id,
        row.id,
        { title: 'Updated' },
        randomUUID(),
      );
      assert.equal(row.priority, 'HIGH');
      assert.equal(row.technicianNotes, 'Preserve this');
      assert.equal(row.branchId, t.branch.id);
      await service.savePlan(
        t.principal,
        t.organization.id,
        plan.id,
        {
          name: 'Changed policy',
          type: 'INSPECTION',
          interval: 2,
          intervalUnit: 'MONTHS',
          intervalBasis: 'COMPLETION',
        },
        randomUUID(),
      );
      row = await action(t, row, 'open');
      row = await action(t, row, 'start');
      row = await action(t, row, 'complete', { notes: 'Inspected' });
      await action(t, row, 'complete', {});
      assert.equal(
        (
          await service.schedules(t.principal, t.organization.id, t.machine.id)
        )[0].nextDueAt,
        '2030-02-28T12:00:00.000Z',
      );
    },
  );
  await suite.test(
    'planned workshop periods reject overlaps and preserve cancellation history',
    async () => {
      const t = await tenant(),
        dates = {
          plannedAt: '2031-01-01T00:00:00Z',
          plannedEndAt: '2031-01-02T00:00:00Z',
        };
      let a = await create(t, dates),
        b = await create(t, dates);
      a = await action(t, a, 'open');
      b = await action(t, b, 'open');
      a = await action(t, a, 'schedule');
      await assert.rejects(action(t, b, 'schedule'), {
        code: 'RENTAL_CONFLICT',
      });
      await action(t, a, 'cancel', { reason: 'Rescheduled' });
      b = await action(t, b, 'schedule');
      assert.equal(b.status, 'PLANNED');
    },
  );
  await suite.test(
    'technical history export omits costs and private notes and enforces export grant',
    async () => {
      const t = await tenant(),
        row = await create(t, { technicianNotes: 'PRIVATE_NOTE' });
      await service.mutateChild(
        t.principal,
        t.organization.id,
        row.id,
        'cost',
        {
          kind: 'LABOR',
          amount: '123',
          tax: { mode: 'EXCLUSIVE', rate: '0' },
          currency: 'TRY',
        },
        randomUUID(),
      );
      const report = await service.report(
        t.principal,
        t.organization.id,
        t.machine.id,
        randomUUID(),
      );
      const json = JSON.stringify(report);
      assert.equal(json.includes('PRIVATE_NOTE'), false);
      assert.equal(json.includes('costs'), false);
      await db.rolePermission.deleteMany({
        where: {
          organizationId: t.organization.id,
          permissionKey: 'maintenance.export',
        },
      });
      await assert.rejects(
        service.report(
          t.principal,
          t.organization.id,
          t.machine.id,
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
    },
  );

  await suite.test(
    'maintenance HTTP guard, cost redaction and secure binary export',
    async () => {
      const t = await tenant(),
        other = await tenant();
      const module = await h.Test.createTestingModule({
        imports: [h.FoundationModule],
      })
        .overrideProvider(h.DATABASE)
        .useValue(db)
        .overrideProvider(h.IdentityVerifier)
        .useValue(new h.TestVerifier())
        .compile();
      const app = module.createNestApplication({ logger: false });
      try {
        await app.listen(0, '127.0.0.1');
        const root =
            (await app.getUrl()) +
            '/organizations/' +
            t.organization.id +
            '/maintenance',
          headers = {
            authorization: 'Bearer test-' + t.user.id,
            'content-type': 'application/json',
          };
        assert.equal((await fetch(root)).status, 401);
        assert.equal(
          (
            await fetch(root, {
              headers: { authorization: 'Bearer test-' + other.user.id },
            })
          ).status,
          403,
        );
        const response = await fetch(root, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            machineId: t.machine.id,
            branchId: t.branch.id,
            title: 'Inspection',
            type: 'INSPECTION',
          }),
        });
        assert.equal(response.status, 201);
        const row = await response.json();
        assert.equal(
          (
            await fetch(root + '/' + row.id + '/start', {
              method: 'POST',
              headers,
              body: '{}',
            })
          ).status,
          409,
        );
        await db.rolePermission.deleteMany({
          where: {
            organizationId: t.organization.id,
            permissionKey: 'maintenance.costs.view',
          },
        });
        const view = await fetch(root + '/' + row.id, { headers });
        assert.equal('costs' in (await view.json()), false);
        const pdf = await fetch(
          root + '/machines/' + t.machine.id + '/export/pdf?locale=tr',
          { headers },
        );
        assert.equal(pdf.status, 200);
        assert.equal(pdf.headers.get('content-type'), 'application/pdf');
        assert.equal(
          Buffer.from(await pdf.arrayBuffer())
            .subarray(0, 4)
            .toString(),
          '%PDF',
        );
        await db.rolePermission.deleteMany({
          where: {
            organizationId: t.organization.id,
            permissionKey: 'maintenance.export',
          },
        });
        assert.equal(
          (
            await fetch(root + '/machines/' + t.machine.id + '/export/pdf', {
              headers,
            })
          ).status,
          403,
        );
      } finally {
        await app.close();
      }
    },
  );
  await suite.test(
    'maintenance database rejects cross-tenant references and concurrent completion retains safety blocks',
    async () => {
      const a = await tenant(),
        b = await tenant();
      let row = await create(a);
      await assert.rejects(
        db.workOrder.update({
          where: { id: row.id },
          data: { machineId: b.machine.id },
        }),
      );
      row = await action(a, row, 'open');
      row = await action(a, row, 'start');
      const outcomes = await Promise.allSettled([
        action(a, row, 'complete', { notes: 'Completed' }),
        service.block(
          a.principal,
          a.organization.id,
          a.machine.id,
          { state: 'SERVICE_BLOCKED', reason: 'Independent issue' },
          randomUUID(),
        ),
      ]);
      for (const outcome of outcomes)
        if (outcome.status === 'rejected')
          assert.equal(outcome.reason.code, 'CONFLICT');
      if (outcomes[1].status === 'rejected')
        await service.block(
          a.principal,
          a.organization.id,
          a.machine.id,
          { state: 'SERVICE_BLOCKED', reason: 'Independent issue retry' },
          randomUUID(),
        );
      if (outcomes[0].status === 'rejected')
        await action(a, row, 'complete', { notes: 'Completed retry' });
      assert.equal(await state(a), 'SERVICE_BLOCKED');
    },
  );
}
