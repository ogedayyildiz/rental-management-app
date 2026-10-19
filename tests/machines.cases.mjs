import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MachineService } from '../apps/api/dist/machines/machine.service.js';
import { PrismaMachineUnitOfWork } from '../apps/api/dist/infrastructure/prisma.machines.js';
const keys = [
  'machines.read',
  'machines.create',
  'machines.update',
  'machines.archive',
  'finance.acquisition_cost.view',
  'finance.acquisition_cost.edit',
];
export async function machineCases(suite, db, fixture, h) {
  const unit = new PrismaMachineUnitOfWork(db),
    service = new MachineService(unit);
  async function tenant() {
    const t = await fixture();
    await db.rolePermission.createMany({
      data: keys.map((permissionKey) => ({
        organizationId: t.organization.id,
        roleId: t.role.id,
        permissionKey,
      })),
    });
    return t;
  }
  const input = (extra = {}) => ({
    fleetNumber: randomUUID(),
    manufacturer: 'Galen',
    model: 'ES1012',
    category: 'Electric scissor lift',
    ...extra,
  });
  const create = (t, extra = {}) =>
    service.create(t.principal, t.organization.id, input(extra), randomUUID());
  const update = (t, id, body) =>
    service.update(t.principal, t.organization.id, id, body, randomUUID());
  const archive = (t, id, body = {}) =>
    service.archive(t.principal, t.organization.id, id, body, randomUUID());
  await suite.test(
    'machines CRUD preserves independent states, exact money and audited retirement',
    async () => {
      const t = await tenant(),
        row = await create(t, {
          acquisitionCost: '9500.123456',
          currency: 'EUR',
          acquisitionDate: '2026-10-17',
          specifications: { workingHeightM: 12, platformHeightM: 10 },
          branchId: t.branch.id,
        });
      assert.equal(row.acquisitionCost, '9500.123456');
      assert.equal(row.rentalState, 'NOT_RENTED');
      assert.equal(row.serviceState, 'NORMAL');
      assert.equal(row.lifecycleState, 'ACTIVE');
      assert.equal(row.createdById, t.user.id);
      const edited = await update(t, row.id, {
        notes: 'Unit note',
        serviceState: 'OUT_OF_SERVICE',
      });
      assert.equal(edited.acquisitionCost, row.acquisitionCost);
      assert.equal(edited.specifications.workingHeightM, 12);
      const retired = await archive(t, row.id);
      assert.equal(retired.lifecycleState, 'RETIRED');
      assert.equal(retired.serviceState, 'OUT_OF_SERVICE');
      assert.equal(retired.rentalState, 'NOT_RENTED');
      await archive(t, row.id);
      await assert.rejects(update(t, row.id, { notes: 'No' }), {
        code: 'CONFLICT',
      });
      assert.equal(
        (await service.list(t.principal, t.organization.id, {})).items.length,
        0,
      );
      assert.equal(
        (
          await service.list(t.principal, t.organization.id, {
            lifecycleState: 'ALL',
          })
        ).items.length,
        1,
      );
      const events = await db.auditEvent.findMany({
        where: { targetId: row.id },
      });
      for (const action of [
        'MACHINE_CREATED',
        'MACHINE_UPDATED',
        'MACHINE_SERVICE_STATE_CHANGED',
        'MACHINE_LIFECYCLE_CHANGED',
        'MACHINE_ARCHIVED',
      ])
        assert.ok(events.some((e) => e.action === action));
      assert.equal(
        events.filter((e) => e.action === 'MACHINE_ARCHIVED').length,
        1,
      );
      assert.ok(
        !JSON.stringify(events.map((e) => e.metadata)).includes('9500'),
      );
      assert.ok(
        events.every(
          (e) =>
            e.actorUserId === t.user.id &&
            e.organizationId === t.organization.id,
        ),
      );
    },
  );
  await suite.test(
    'machine tenant boundaries protect reads, writes and composite model/branch foreign keys',
    async () => {
      const a = await tenant(),
        b = await tenant(),
        row = await create(b, { branchId: b.branch.id });
      await assert.rejects(
        service.get(a.principal, b.organization.id, row.id),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(
        service.get(a.principal, a.organization.id, row.id),
        { code: 'NOT_FOUND' },
      );
      await assert.rejects(update(a, row.id, { notes: 'No' }), {
        code: 'NOT_FOUND',
      });
      await assert.rejects(archive(a, row.id), { code: 'NOT_FOUND' });
      await assert.rejects(create(a, { branchId: b.branch.id }), {
        code: 'NOT_FOUND',
      });
      const own = await create(a);
      await assert.rejects(
        db.machine.update({
          where: { id: own.id },
          data: { modelId: row.modelId },
        }),
      );
      await assert.rejects(
        db.machine.update({
          where: { id: own.id },
          data: { branchId: b.branch.id },
        }),
      );
      await db.organization.update({
        where: { id: a.organization.id },
        data: { status: 'SUSPENDED' },
      });
      await assert.rejects(
        service.get(a.principal, a.organization.id, own.id),
        { code: 'ACCESS_DENIED' },
      );
    },
  );
  await suite.test(
    'selected branches hide unassigned/out-of-scope assets and prevent unauthorized transfers',
    async () => {
      const t = await tenant(),
        other = await db.branch.create({
          data: { organizationId: t.organization.id, name: 'Other' },
        }),
        own = await create(t, { branchId: t.branch.id }),
        hidden = await create(t, { branchId: other.id });
      await create(t);
      await db.membership.update({
        where: { id: t.membership.id },
        data: { branchScope: 'SELECTED_BRANCHES' },
      });
      await db.membershipBranch.create({
        data: {
          organizationId: t.organization.id,
          membershipId: t.membership.id,
          branchId: t.branch.id,
        },
      });
      assert.deepEqual(
        (await service.list(t.principal, t.organization.id, {})).items.map(
          (m) => m.id,
        ),
        [own.id],
      );
      assert.equal(
        (
          await service.list(t.principal, t.organization.id, {
            branchId: other.id,
          })
        ).items.length,
        0,
      );
      await assert.rejects(
        service.get(t.principal, t.organization.id, hidden.id),
        { code: 'NOT_FOUND' },
      );
      await assert.rejects(update(t, hidden.id, { branchId: t.branch.id }), {
        code: 'NOT_FOUND',
      });
      await assert.rejects(archive(t, hidden.id), { code: 'NOT_FOUND' });
      await assert.rejects(update(t, own.id, { branchId: other.id }), {
        code: 'ACCESS_DENIED',
      });
      await assert.rejects(update(t, own.id, { branchId: null }), {
        code: 'ACCESS_DENIED',
      });
      await assert.rejects(create(t), { code: 'ACCESS_DENIED' });
      assert.deepEqual(
        (await service.branches(t.principal, t.organization.id)).map(
          (b) => b.id,
        ),
        [t.branch.id],
      );
      await db.membershipBranch.deleteMany({
        where: { membershipId: t.membership.id },
      });
      assert.equal(
        (await service.list(t.principal, t.organization.id, {})).items.length,
        0,
      );
    },
  );
  await suite.test(
    'machine branch changes audit before/after and reject disabled destinations',
    async () => {
      const t = await tenant(),
        row = await create(t);
      await update(t, row.id, { branchId: t.branch.id });
      const e = await db.auditEvent.findFirst({
        where: { targetId: row.id, action: 'MACHINE_BRANCH_CHANGED' },
      });
      assert.deepEqual(e.metadata, {
        previousBranchId: null,
        nextBranchId: t.branch.id,
      });
      await db.branch.update({
        where: { id: t.branch.id },
        data: { active: false },
      });
      await assert.rejects(create(t, { branchId: t.branch.id }), {
        code: 'NOT_FOUND',
      });
    },
  );
  await suite.test(
    'all machine operations enforce permissions; platform permissions confer no access',
    async () => {
      const t = await tenant(),
        row = await create(t);
      await db.rolePermission.deleteMany({
        where: { roleId: t.role.id, permissionKey: { in: keys } },
      });
      for (const call of [
        () => service.list(t.principal, t.organization.id, {}),
        () => service.get(t.principal, t.organization.id, row.id),
        () => create(t),
        () => update(t, row.id, { notes: 'No' }),
        () => archive(t, row.id),
        () => service.branches(t.principal, t.organization.id),
      ])
        await assert.rejects(call, { code: 'ACCESS_DENIED' });
      const platformRole = await db.platformRole.create({
        data: {
          name: randomUUID(),
          permissions: {
            create: { permissionKey: 'platform.organization.create' },
          },
        },
      });
      await db.platformAccess.create({
        data: {
          userId: t.user.id,
          active: true,
          roles: { create: { roleId: platformRole.id } },
        },
      });
      await assert.rejects(
        service.get(t.principal, t.organization.id, row.id),
        { code: 'ACCESS_DENIED' },
      );
    },
  );
  await suite.test(
    'cost view and edit permissions remain independent on every response path',
    async () => {
      const t = await tenant(),
        row = await create(t, { acquisitionCost: '12500', currency: 'TRY' });
      await db.rolePermission.deleteMany({
        where: { roleId: t.role.id, permissionKey: { startsWith: 'finance.' } },
      });
      for (const result of [
        await service.get(t.principal, t.organization.id, row.id),
        (await service.list(t.principal, t.organization.id, {})).items[0],
        await update(t, row.id, { notes: 'Operational edit' }),
        await create(t),
      ]) {
        assert.ok(!('acquisitionCost' in result));
        assert.ok(!('currency' in result));
      }
      assert.equal(
        (
          await db.machine.findUniqueOrThrow({ where: { id: row.id } })
        ).acquisitionCost.toString(),
        '12500',
      );
      await assert.rejects(
        update(t, row.id, { acquisitionCost: null, currency: null }),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(
        create(t, { acquisitionCost: '1', currency: 'TRY' }),
        { code: 'ACCESS_DENIED' },
      );
      await db.rolePermission.create({
        data: {
          organizationId: t.organization.id,
          roleId: t.role.id,
          permissionKey: 'finance.acquisition_cost.edit',
        },
      });
      assert.ok(
        !(
          'acquisitionCost' in
          (await update(t, row.id, { acquisitionCost: '99', currency: 'EUR' }))
        ),
      );
      assert.ok(!('acquisitionCost' in (await archive(t, row.id))));
    },
  );
  await suite.test(
    'fleet identifiers are tenant-unique including archived records; serial numbers are optional/nonunique',
    async () => {
      const a = await tenant(),
        b = await tenant(),
        first = await create(a, {
          fleetNumber: 'UM-001',
          serialNumber: 'SAME',
        });
      await assert.rejects(create(a, { fleetNumber: ' um-001 ' }), {
        code: 'CONFLICT',
      });
      await create(b, { fleetNumber: 'UM-001' });
      await create(a, { serialNumber: 'SAME' });
      await create(a, { serialNumber: null });
      await archive(a, first.id);
      await assert.rejects(create(a, { fleetNumber: 'UM-001' }), {
        code: 'CONFLICT',
      });
      const results = await Promise.allSettled([
        create(a, { fleetNumber: 'RACE' }),
        create(a, { fleetNumber: 'RACE' }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    },
  );
  await suite.test(
    'machine validation rejects injected states, telemetry and invalid acquisition/specification values',
    async () => {
      const t = await tenant();
      for (const bad of [
        { fleetNumber: 'ß'.repeat(100) },
        { rentalState: 'RENTED' },
        { lifecycleState: 'SOLD' },
        { serviceState: 'OFFLINE' },
        { deviceId: randomUUID() },
        { specifications: { batterySoc: 50 } },
        { specifications: { workingHeightM: -1 } },
        { specifications: { machineWeightKg: 0 } },
        { specifications: { workingHeightM: 2, platformHeightM: 4 } },
        { acquisitionCost: '-1', currency: 'TRY' },
        { acquisitionCost: 5, currency: 'TRY' },
        { acquisitionCost: '1.1234567', currency: 'TRY' },
        { acquisitionCost: '1' },
        { currency: 'TRY' },
        { acquisitionDate: '2026-02-30' },
        { modelYear: 2026.5 },
        { organizationId: randomUUID() },
      ])
        await assert.rejects(create(t, bad));
      const row = await create(t, {
        acquisitionCost: '0',
        currency: 'TRY',
        specifications: { workingHeightM: 10000, powerSource: 'Hydrogen' },
      });
      assert.equal(row.acquisitionCost, '0');
      await assert.rejects(update(t, row.id, { rentalState: 'RESERVED' }));
      await assert.rejects(update(t, row.id, { currency: null }));
      await db.machine.update({
        where: { id: row.id },
        data: { rentalState: 'RENTED' },
      });
      await assert.rejects(archive(t, row.id), { code: 'CONFLICT' });
    },
  );
  await suite.test(
    'machine catalog reuse, all search filters and stable cursor pagination',
    async () => {
      const t = await tenant(),
        rows = [];
      for (let i = 0; i < 5; i++)
        rows.push(
          await create(t, {
            fleetNumber: `F-${i}`,
            serialNumber: `SER-${i}`,
            branchId: t.branch.id,
          }),
        );
      assert.equal(new Set(rows.map((r) => r.modelId)).size, 1);
      assert.equal(
        await db.machineCategory.count({
          where: { organizationId: t.organization.id },
        }),
        1,
      );
      await create(t, {
        manufacturer: 'Other',
        model: 'Fork',
        category: 'Forklift',
      });
      for (const q of [
        { fleetNumber: 'F-' },
        { manufacturer: 'galen' },
        { model: 'ES1012' },
        { serialNumber: 'SER-' },
        { category: 'scissor' },
        { branchId: t.branch.id },
        { q: 'Galen' },
        {
          serviceState: 'NORMAL',
          rentalState: 'NOT_RENTED',
          category: 'scissor',
        },
      ])
        assert.equal(
          (await service.list(t.principal, t.organization.id, q)).items.length,
          5,
        );
      let cursor;
      const ids = [];
      do {
        const page = await service.list(t.principal, t.organization.id, {
          category: 'scissor',
          limit: 2,
          ...(cursor ? { cursor } : {}),
        });
        ids.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(ids.length, 5);
      assert.equal(new Set(ids).size, 5);
    },
  );
  await suite.test(
    'machine audit failure rolls back catalog, asset, branch, service and lifecycle mutations',
    async () => {
      const t = await tenant(),
        row = await create(t),
        broken = new MachineService({
          run: (work) =>
            unit.run((r) =>
              work({
                ...r,
                audit: {
                  append: async () => {
                    throw new Error('audit unavailable');
                  },
                },
              }),
            ),
        });
      await assert.rejects(
        broken.create(
          t.principal,
          t.organization.id,
          input({ category: 'Rollback category' }),
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(
        await db.machineCategory.count({
          where: {
            organizationId: t.organization.id,
            name: 'Rollback category',
          },
        }),
        0,
      );
      await assert.rejects(
        broken.update(
          t.principal,
          t.organization.id,
          row.id,
          { branchId: t.branch.id, serviceState: 'SERVICE_BLOCKED' },
          randomUUID(),
        ),
        /audit unavailable/,
      );
      await assert.rejects(
        broken.archive(
          t.principal,
          t.organization.id,
          row.id,
          {},
          randomUUID(),
        ),
        /audit unavailable/,
      );
      const after = await service.get(t.principal, t.organization.id, row.id);
      assert.equal(after.branchId, null);
      assert.equal(after.serviceState, 'NORMAL');
      assert.equal(after.lifecycleState, 'ACTIVE');
    },
  );
  await suite.test(
    'Machine HTTP guards, validation, cost redaction and sold lifecycle',
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
        const root = `${await app.getUrl()}/organizations/${t.organization.id}/machines`,
          headers = {
            authorization: `Bearer test-${t.user.id}`,
            'content-type': 'application/json',
          };
        assert.equal((await fetch(root)).status, 401);
        assert.equal(
          (
            await fetch(root, {
              headers: { authorization: `Bearer test-${other.user.id}` },
            })
          ).status,
          403,
        );
        const response = await fetch(root, {
          method: 'POST',
          headers,
          body: JSON.stringify(
            input({ acquisitionCost: '55', currency: 'TRY' }),
          ),
        });
        assert.equal(response.status, 201);
        const row = await response.json();
        assert.equal(row.acquisitionCost, '55');
        assert.equal(
          (await fetch(`${root}/branches`, { headers })).status,
          200,
        );
        await db.rolePermission.deleteMany({
          where: {
            roleId: t.role.id,
            permissionKey: 'finance.acquisition_cost.view',
          },
        });
        const read = await fetch(`${root}/${row.id}`, { headers });
        assert.equal(read.headers.get('cache-control'), 'no-store');
        assert.ok(!('acquisitionCost' in (await read.json())));
        assert.equal(
          (
            await fetch(`${root}/${row.id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ notes: 'HTTP' }),
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await fetch(`${root}/${row.id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ rentalState: 'RENTED' }),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await fetch(`${root}/${row.id}/archive`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ lifecycleState: 'SOLD' }),
            })
          ).status,
          201,
        );
      } finally {
        await app.close();
      }
    },
  );
}
