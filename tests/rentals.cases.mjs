import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RentalService } from '../apps/api/dist/rentals/rental.service.js';
import { PrismaRentalUnitOfWork } from '../apps/api/dist/infrastructure/prisma.rentals.js';
import { MachineService } from '../apps/api/dist/machines/machine.service.js';
import { PrismaMachineUnitOfWork } from '../apps/api/dist/infrastructure/prisma.machines.js';
import { CustomerService } from '../apps/api/dist/customers/customer.service.js';
import { PrismaCustomerUnitOfWork } from '../apps/api/dist/infrastructure/prisma.customers.js';
const keys = [
  'rentals.read',
  'rentals.create',
  'rentals.update',
  'rentals.reserve',
  'rentals.dispatch',
  'rentals.return',
  'rentals.cancel',
  'rentals.extend',
  'rentals.pricing.view',
  'rentals.pricing.edit',
];
const start = '2030-01-01T00:00:00.000Z',
  end = '2030-01-10T00:00:00.000Z',
  later = '2030-01-20T00:00:00.000Z',
  now = '2030-01-03T12:00:00.000Z';
export async function rentalCases(suite, db, fixture, h) {
  const unit = new PrismaRentalUnitOfWork(db),
    service = new RentalService(unit, () => new Date(now)),
    machines = new MachineService(new PrismaMachineUnitOfWork(db)),
    customers = new CustomerService(new PrismaCustomerUnitOfWork(db));
  async function tenant() {
    const t = await fixture();
    await db.rolePermission.createMany({
      data: [
        ...keys,
        'machines.read',
        'machines.create',
        'machines.update',
        'machines.archive',
        'customers.create',
      ].map((permissionKey) => ({
        organizationId: t.organization.id,
        roleId: t.role.id,
        permissionKey,
      })),
    });
    t.customer = await customers.create(
      t.principal,
      t.organization.id,
      { type: 'COMPANY', displayName: 'Rental customer' },
      randomUUID(),
    );
    t.machine = await machine(t);
    return t;
  }
  const machine = (t, extra = {}) =>
    machines.create(
      t.principal,
      t.organization.id,
      {
        fleetNumber: randomUUID(),
        manufacturer: 'Galen',
        model: 'ES1012',
        category: 'Scissor lift',
        branchId: t.branch.id,
        ...extra,
      },
      randomUUID(),
    );
  const item = (t, extra = {}) => ({
    machineIds: [t.machine.id],
    plannedStartAt: start,
    plannedEndAt: end,
    agreedRate: '99.123456',
    rateUnit: 'DAILY',
    currency: 'TRY',
    ...extra,
  });
  const create = (t, items = [item(t)], extra = {}) =>
    service.create(
      t.principal,
      t.organization.id,
      { customerId: t.customer.id, branchId: t.branch.id, items, ...extra },
      randomUUID(),
    );
  const call = (t, method, id, body) =>
    service[method](t.principal, t.organization.id, id, body, randomUUID());
  const reserve = (t, id) =>
    service.confirm(t.principal, t.organization.id, id, false, randomUUID());
  const state = async (t) =>
    (await db.machine.findUniqueOrThrow({ where: { id: t.machine.id } }))
      .rentalState;
  await suite.test(
    'platform height filters availability and preserves deferred assignment requirements',
    async () => {
      const t = await tenant();
      const short = await machine(t, {
        specifications: { platformHeightM: 6 },
      });
      const tall = await machine(t, { specifications: { platformHeightM: 8 } });
      const query = {
        plannedStartAt: start,
        plannedEndAt: end,
        branchId: t.branch.id,
        platformHeightM: '8',
      };
      const available = await service.availability(
        t.principal,
        t.organization.id,
        query,
      );
      assert.deepEqual(
        available.items.map((m) => m.id),
        [tall.id],
      );
      for (const platformHeightM of ['0', '-1', 'invalid']) {
        await assert.rejects(
          service.availability(t.principal, t.organization.id, {
            ...query,
            platformHeightM,
          }),
        );
      }
      let row = await create(t, [
        item(t, {
          machineIds: [],
          requestedCategoryId: tall.categoryId,
          specifications: { platformHeightM: 8 },
        }),
      ]);
      row = await reserve(t, row.id);
      assert.equal(row.items[0].assignments.length, 0);
      assert.equal(row.items[0].specifications.platformHeightM, 8);
      await assert.rejects(
        call(t, 'assign', row.id, {
          itemId: row.items[0].id,
          machineIds: [short.id],
        }),
      );
      row = await call(t, 'assign', row.id, {
        itemId: row.items[0].id,
        machineIds: [tall.id],
      });
      assert.equal(row.items[0].assignments[0].machineId, tall.id);
    },
  );
  await suite.test(
    'corrected orphan model remains historical but is not offered for new rentals',
    async () => {
      const t = await tenant();
      const original = t.machine.modelId;
      const corrected = await machines.update(
        t.principal,
        t.organization.id,
        t.machine.id,
        { model: 'Correct model' },
        randomUUID(),
      );
      const catalog = await service.catalog(t.principal, t.organization.id);
      assert.equal(
        catalog.models.find((m) => m.id === original).availableForRental,
        false,
      );
      assert.equal(
        catalog.models.find((m) => m.id === corrected.modelId)
          .availableForRental,
        true,
      );
    },
  );
  await suite.test(
    'rental draft, quote, reserve, dispatch, return and completion preserve exact rates and machine state ownership',
    async () => {
      const t = await tenant();
      let row = await create(t);
      assert.equal(row.status, 'DRAFT');
      assert.equal(row.items[0].agreedRate, '99.123456');
      assert.match(row.number, /^R-\d{4}-\d{6}$/);
      row = await call(t, 'update', row.id, { notes: 'Planning' });
      await service.confirm(
        t.principal,
        t.organization.id,
        row.id,
        true,
        randomUUID(),
      );
      assert.equal(await state(t), 'NOT_RENTED');
      row = await reserve(t, row.id);
      assert.equal(await state(t), 'RESERVED');
      const ids = row.items[0].assignments.map((a) => a.id);
      await reserve(t, row.id);
      row = await call(t, 'dispatch', row.id, {
        assignmentIds: ids,
        actualStartAt: start,
      });
      assert.equal(row.status, 'ACTIVE');
      assert.equal(await state(t), 'RENTED');
      await call(t, 'dispatch', row.id, {
        assignmentIds: ids,
        actualStartAt: start,
      });
      await assert.rejects(
        machines.update(
          t.principal,
          t.organization.id,
          t.machine.id,
          { rentalState: 'NOT_RENTED' },
          randomUUID(),
        ),
        { code: 'INVALID_INPUT' },
      );
      await assert.rejects(
        machines.archive(
          t.principal,
          t.organization.id,
          t.machine.id,
          {},
          randomUUID(),
        ),
        { code: 'MACHINE_COMMITTED' },
      );
      await call(t, 'returnMachines', row.id, {
        assignmentIds: ids,
        actualEndAt: now,
      });
      assert.equal(await state(t), 'NOT_RENTED');
      row = await service.complete(
        t.principal,
        t.organization.id,
        row.id,
        randomUUID(),
      );
      assert.equal(row.status, 'COMPLETED');
      assert.equal(row.actualEndAt, now);
      await assert.rejects(
        call(t, 'dispatch', row.id, {
          assignmentIds: ids,
          actualStartAt: start,
        }),
        { code: 'INVALID_TRANSITION' },
      );
      assert.ok(
        await db.auditEvent.count({
          where: { targetId: row.id, action: 'RENTAL_COMPLETED' },
        }),
      );
    },
  );
  await suite.test(
    'physical conflicts reject overlapping reservations; adjacent periods and cancellation release correctly',
    async () => {
      const t = await tenant(),
        a = await create(t),
        b = await create(t);
      await reserve(t, a.id);
      await assert.rejects(reserve(t, b.id), { code: 'RENTAL_CONFLICT' });
      assert.equal(
        (await service.get(t.principal, t.organization.id, b.id)).status,
        'DRAFT',
      );
      const adjacent = await create(t, [
        item(t, { plannedStartAt: end, plannedEndAt: later }),
      ]);
      await reserve(t, adjacent.id);
      await call(t, 'cancel', a.id, { reason: 'Changed plan' });
      assert.equal(await state(t), 'RESERVED');
      await call(t, 'cancel', adjacent.id, { reason: 'Changed plan' });
      assert.equal(await state(t), 'NOT_RENTED');
      await reserve(t, b.id);
    },
  );
  await suite.test(
    'concurrent reservation writes cannot double book',
    async () => {
      const t = await tenant(),
        a = await create(t),
        b = await create(t);
      const results = await Promise.allSettled([
        reserve(t, a.id),
        reserve(t, b.id),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.ok(
        ['CONFLICT', 'RENTAL_CONFLICT'].includes(
          results.find((r) => r.status === 'rejected').reason.code,
        ),
      );
      assert.notEqual(a.number, b.number);
    },
  );
  await suite.test(
    'unallocated category quantity consumes capacity and assignment revalidates the pool',
    async () => {
      const t = await tenant(),
        second = await machine(t),
        model = await db.machineModel.findUniqueOrThrow({
          where: { id: t.machine.modelId },
        });
      const a = await create(t, [
        item(t, {
          machineIds: [],
          requestedCategoryId: model.categoryId,
          quantity: 2,
        }),
      ]);
      await reserve(t, a.id);
      const b = await create(t, [
        item(t, { machineIds: [], requestedModelId: model.id }),
      ]);
      await assert.rejects(reserve(t, b.id), { code: 'RENTAL_CONFLICT' });
      let row = await call(t, 'assign', a.id, {
        itemId: a.items[0].id,
        machineIds: [t.machine.id, second.id],
      });
      assert.equal(row.items[0].assignments.length, 2);
      row = await call(t, 'release', a.id, {
        assignmentId: row.items[0].assignments[0].id,
        reason: 'Allocate later',
      });
      assert.equal(
        row.items[0].assignments.filter((a) => !a.releasedAt).length,
        1,
      );
      await assert.rejects(reserve(t, b.id), { code: 'RENTAL_CONFLICT' });
    },
  );
  await suite.test(
    'partial returns and replacement preserve assignment history',
    async () => {
      const t = await tenant(),
        second = await machine(t),
        replacement = await machine(t);
      let row = await create(t, [
        item(t, { quantity: 2, machineIds: [t.machine.id, second.id] }),
      ]);
      row = await reserve(t, row.id);
      const ids = row.items[0].assignments.map((a) => a.id);
      await call(t, 'dispatch', row.id, {
        assignmentIds: ids,
        actualStartAt: start,
      });
      row = await call(t, 'replace', row.id, {
        assignmentId: ids[0],
        machineId: replacement.id,
        actualAt: now,
        reason: 'Equivalent replacement',
      });
      assert.equal(row.items[0].assignments.length, 3);
      assert.equal(
        row.items[0].assignments.find((a) => a.id === ids[0]).actualEndAt,
        now,
      );
      const active = row.items[0].assignments.filter((a) => !a.releasedAt);
      await call(t, 'returnMachines', row.id, {
        assignmentIds: [active[0].id],
        actualEndAt: now,
      });
      await assert.rejects(
        service.complete(t.principal, t.organization.id, row.id, randomUUID()),
        { code: 'INVALID_TRANSITION' },
      );
      await call(t, 'returnMachines', row.id, {
        assignmentIds: [active[1].id],
        actualEndAt: now,
      });
      await service.complete(
        t.principal,
        t.organization.id,
        row.id,
        randomUUID(),
      );
      assert.equal(
        await db.rentalMachineAssignment.count({
          where: { itemId: row.items[0].id },
        }),
        3,
      );
    },
  );
  await suite.test(
    'extensions preserve original pricing and roll back conflicts',
    async () => {
      const t = await tenant(),
        a = await create(t),
        b = await create(t, [
          item(t, { plannedStartAt: end, plannedEndAt: later }),
        ]);
      await reserve(t, a.id);
      await reserve(t, b.id);
      await assert.rejects(
        call(t, 'extend', a.id, {
          items: [{ itemId: a.items[0].id, plannedEndAt: later }],
        }),
        { code: 'RENTAL_CONFLICT' },
      );
      assert.equal(
        await db.rentalItemTerm.count({ where: { itemId: a.items[0].id } }),
        1,
      );
      await call(t, 'cancel', b.id, { reason: 'Cancelled' });
      const row = await call(t, 'extend', a.id, {
        items: [
          { itemId: a.items[0].id, plannedEndAt: later, agreedRate: '101.5' },
        ],
      });
      assert.equal(row.items[0].agreedRate, '99.123456');
      assert.equal(row.items[0].terms.length, 2);
      assert.equal(row.items[0].terms[1].agreedRate, '101.5');
    },
  );
  await suite.test(
    'tenant and composite foreign keys reject cross-tenant customers, branches, machines and items',
    async () => {
      const a = await tenant(),
        b = await tenant(),
        row = await create(b);
      await assert.rejects(
        service.get(a.principal, a.organization.id, row.id),
        { code: 'NOT_FOUND' },
      );
      await assert.rejects(
        service.get(a.principal, b.organization.id, row.id),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(create(a, [], { customerId: b.customer.id }), {
        code: 'NOT_FOUND',
      });
      await assert.rejects(create(a, [], { branchId: b.branch.id }), {
        code: 'NOT_FOUND',
      });
      await assert.rejects(
        create(a, [item(a, { machineIds: [b.machine.id] })]),
        { code: 'NOT_FOUND' },
      );
      const own = await create(a);
      await assert.rejects(
        db.rental.update({
          where: { id: own.id },
          data: { customerId: b.customer.id },
        }),
      );
      await assert.rejects(
        db.rentalMachineAssignment.create({
          data: {
            organizationId: a.organization.id,
            itemId: own.items[0].id,
            machineId: b.machine.id,
          },
        }),
      );
      await assert.rejects(
        db.rentalMachineAssignment.create({
          data: {
            organizationId: a.organization.id,
            itemId: row.items[0].id,
            machineId: a.machine.id,
          },
        }),
      );
    },
  );
  await suite.test(
    'selected branch scope cannot be widened by filters or IDs',
    async () => {
      const t = await tenant(),
        other = await db.branch.create({
          data: { organizationId: t.organization.id, name: 'Other' },
        }),
        foreign = await machine(t, { branchId: other.id });
      const visible = await create(t),
        hidden = await create(t, [item(t, { machineIds: [foreign.id] })], {
          branchId: other.id,
        });
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
          (r) => r.id,
        ),
        [visible.id],
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
      await assert.rejects(create(t, [], { branchId: null }), {
        code: 'ACCESS_DENIED',
      });
      await assert.rejects(
        service.availability(t.principal, t.organization.id, {
          plannedStartAt: start,
          plannedEndAt: end,
          branchId: other.id,
        }),
        { code: 'ACCESS_DENIED' },
      );
    },
  );
  await suite.test(
    'workflow and pricing permissions remain independent',
    async () => {
      const t = await tenant(),
        row = await create(t);
      await db.rolePermission.deleteMany({
        where: {
          roleId: t.role.id,
          permissionKey: { startsWith: 'rentals.pricing.' },
        },
      });
      for (const result of [
        await service.get(t.principal, t.organization.id, row.id),
        (await service.list(t.principal, t.organization.id, {})).items[0],
        await reserve(t, row.id),
      ]) {
        assert.ok(!('agreedRate' in result.items[0]));
        assert.ok(!('terms' in result.items[0]));
      }
      await assert.rejects(create(t), { code: 'ACCESS_DENIED' });
      await assert.rejects(
        call(t, 'extend', row.id, {
          items: [
            { itemId: row.items[0].id, plannedEndAt: later, agreedRate: '2' },
          ],
        }),
        { code: 'ACCESS_DENIED' },
      );
      await db.rolePermission.deleteMany({
        where: { roleId: t.role.id, permissionKey: { in: keys } },
      });
      for (const action of [
        () => create(t, []),
        () => service.get(t.principal, t.organization.id, row.id),
        () => reserve(t, row.id),
        () => call(t, 'dispatch', row.id, {}),
        () => call(t, 'returnMachines', row.id, {}),
        () => call(t, 'extend', row.id, {}),
        () => call(t, 'cancel', row.id, { reason: 'No' }),
        () => call(t, 'update', row.id, { notes: 'No' }),
      ])
        await assert.rejects(action, { code: 'ACCESS_DENIED' });
    },
  );
  await suite.test(
    'machine service/lifecycle eligibility is rechecked at reserve and dispatch',
    async () => {
      const t = await tenant(),
        row = await create(t);
      await machines.update(
        t.principal,
        t.organization.id,
        t.machine.id,
        { serviceState: 'SERVICE_BLOCKED' },
        randomUUID(),
      );
      await assert.rejects(reserve(t, row.id), { code: 'MACHINE_INELIGIBLE' });
      await machines.update(
        t.principal,
        t.organization.id,
        t.machine.id,
        { serviceState: 'MAINTENANCE_DUE' },
        randomUUID(),
      );
      const reserved = await reserve(t, row.id);
      await machines.update(
        t.principal,
        t.organization.id,
        t.machine.id,
        { serviceState: 'OUT_OF_SERVICE' },
        randomUUID(),
      );
      await assert.rejects(
        call(t, 'dispatch', row.id, {
          assignmentIds: reserved.items[0].assignments.map((a) => a.id),
          actualStartAt: start,
        }),
        { code: 'MACHINE_INELIGIBLE' },
      );
      await assert.rejects(
        machines.update(
          t.principal,
          t.organization.id,
          t.machine.id,
          { branchId: null },
          randomUUID(),
        ),
        { code: 'MACHINE_COMMITMENT_CONFLICT' },
      );
      await call(t, 'cancel', row.id, { reason: 'Service' });
      await machines.archive(
        t.principal,
        t.organization.id,
        t.machine.id,
        { lifecycleState: 'SOLD' },
        randomUUID(),
      );
      await assert.rejects(create(t), { code: 'MACHINE_INELIGIBLE' });
    },
  );
  await suite.test(
    'date, state and commercial validation rejects invalid external input',
    async () => {
      const t = await tenant();
      for (const extra of [
        { plannedEndAt: start },
        { plannedEndAt: 'invalid' },
        { plannedEndAt: null },
        { agreedRate: '-1' },
        { agreedRate: 0.1 },
        { agreedRate: '1.1234567' },
        { currency: 'xx' },
        { rateUnit: 'FORTNIGHT' },
        { quantity: 0 },
      ])
        await assert.rejects(create(t, [item(t, extra)]), {
          code: 'INVALID_INPUT',
        });
      await assert.rejects(create(t, [], { status: 'ACTIVE' }), {
        code: 'INVALID_INPUT',
      });
      const row = await create(t);
      await assert.rejects(
        call(t, 'dispatch', row.id, {
          assignmentIds: row.items[0].assignments.map((a) => a.id),
          actualStartAt: start,
        }),
        { code: 'INVALID_TRANSITION' },
      );
      await reserve(t, row.id);
      await assert.rejects(call(t, 'update', row.id, { notes: 'Locked' }), {
        code: 'INVALID_TRANSITION',
      });
    },
  );
  await suite.test(
    'search, filters, availability and cursor pagination are tenant scoped',
    async () => {
      const t = await tenant(),
        ids = [];
      for (let n = 0; n < 4; n++) ids.push((await create(t)).id);
      let cursor;
      const seen = [];
      do {
        const page = await service.list(t.principal, t.organization.id, {
          limit: 2,
          ...(cursor ? { cursor } : {}),
        });
        seen.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(new Set(seen).size, 4);
      for (const q of [
        { customerId: t.customer.id },
        { machineId: t.machine.id },
        { branchId: t.branch.id },
        { status: 'DRAFT' },
        { plannedFrom: start, plannedTo: end },
      ])
        assert.equal(
          (await service.list(t.principal, t.organization.id, q)).items.length,
          4,
        );
      const q = {
        plannedStartAt: start,
        plannedEndAt: end,
        branchId: t.branch.id,
      };
      assert.equal(
        (await service.availability(t.principal, t.organization.id, q)).items
          .length,
        1,
      );
      await reserve(t, ids[0]);
      assert.equal(
        (await service.availability(t.principal, t.organization.id, q)).items
          .length,
        0,
      );
    },
  );
  await suite.test(
    'audit failure rolls back rental, counter, confirmation, terms and machine state',
    async () => {
      const t = await tenant(),
        broken = new RentalService(
          {
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
          },
          () => new Date(now),
        );
      await assert.rejects(
        broken.create(
          t.principal,
          t.organization.id,
          {
            customerId: t.customer.id,
            branchId: t.branch.id,
            items: [item(t)],
          },
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(
        await db.rental.count({ where: { organizationId: t.organization.id } }),
        0,
      );
      assert.equal(
        await db.rentalCounter.count({
          where: { organizationId: t.organization.id },
        }),
        0,
      );
      const row = await create(t);
      await assert.rejects(
        broken.confirm(
          t.principal,
          t.organization.id,
          row.id,
          false,
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(await state(t), 'NOT_RENTED');
      assert.equal(
        await db.rentalItemTerm.count({ where: { itemId: row.items[0].id } }),
        0,
      );
    },
  );

  await suite.test(
    'overdue rentals block new capacity; backdated dispatch cannot overlap completed history',
    async () => {
      const t = await tenant();
      const a = await create(t, [
        item(t, { plannedEndAt: '2030-01-02T00:00:00.000Z' }),
      ]);
      let row = await reserve(t, a.id);
      const assignmentId = row.items[0].assignments[0].id;
      await call(t, 'dispatch', a.id, {
        assignmentIds: [assignmentId],
        actualStartAt: start,
      });
      const b = await create(t, [
        item(t, { plannedStartAt: '2030-01-03T00:00:00.000Z' }),
      ]);
      await assert.rejects(reserve(t, b.id), { code: 'RENTAL_CONFLICT' });
      await call(t, 'returnMachines', a.id, {
        assignmentIds: [assignmentId],
        actualEndAt: now,
      });
      await service.complete(
        t.principal,
        t.organization.id,
        a.id,
        randomUUID(),
      );
      row = await reserve(t, b.id);
      await assert.rejects(
        call(t, 'dispatch', b.id, {
          assignmentIds: [row.items[0].assignments[0].id],
          actualStartAt: '2030-01-03T00:00:00.000Z',
        }),
        { code: 'RENTAL_CONFLICT' },
      );
      await call(t, 'dispatch', b.id, {
        assignmentIds: [row.items[0].assignments[0].id],
        actualStartAt: now,
      });
    },
  );
  await suite.test(
    'concurrent extension and new reservation cannot both take the same machine period',
    async () => {
      const t = await tenant(),
        a = await create(t),
        b = await create(t, [
          item(t, { plannedStartAt: end, plannedEndAt: later }),
        ]);
      await reserve(t, a.id);
      const results = await Promise.allSettled([
        call(t, 'extend', a.id, {
          items: [{ itemId: a.items[0].id, plannedEndAt: later }],
        }),
        reserve(t, b.id),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    },
  );
  await suite.test(
    'returns retain blocking service state; failed audits roll back return and dispatch',
    async () => {
      const t = await tenant(),
        a = await create(t);
      const row = await reserve(t, a.id),
        ids = row.items[0].assignments.map((a) => a.id);
      const broken = new RentalService(
        {
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
        },
        () => new Date(now),
      );
      await assert.rejects(
        broken.dispatch(
          t.principal,
          t.organization.id,
          a.id,
          { assignmentIds: ids, actualStartAt: start },
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(await state(t), 'RESERVED');
      await call(t, 'dispatch', a.id, {
        assignmentIds: ids,
        actualStartAt: start,
      });
      await machines.update(
        t.principal,
        t.organization.id,
        t.machine.id,
        { serviceState: 'OUT_OF_SERVICE' },
        randomUUID(),
      );
      await assert.rejects(
        broken.returnMachines(
          t.principal,
          t.organization.id,
          a.id,
          { assignmentIds: ids, actualEndAt: now },
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(await state(t), 'RENTED');
      await call(t, 'returnMachines', a.id, {
        assignmentIds: ids,
        actualEndAt: now,
      });
      assert.equal(await state(t), 'NOT_RENTED');
      assert.equal(
        (await db.machine.findUniqueOrThrow({ where: { id: t.machine.id } }))
          .serviceState,
        'OUT_OF_SERVICE',
      );
      assert.equal(
        (
          await service.availability(t.principal, t.organization.id, {
            plannedStartAt: start,
            plannedEndAt: end,
            branchId: t.branch.id,
          })
        ).items.length,
        0,
      );
    },
  );
  await suite.test(
    'Rental HTTP authentication, tenant guard, workflow routes and sensitive price redaction',
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
            '/rentals',
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
            customerId: t.customer.id,
            branchId: t.branch.id,
            items: [item(t)],
          }),
        });
        assert.equal(response.status, 201);
        const row = await response.json();
        assert.equal(
          (
            await fetch(root + '/' + row.id + '/reserve', {
              method: 'POST',
              headers,
            })
          ).status,
          201,
        );
        await db.rolePermission.deleteMany({
          where: { roleId: t.role.id, permissionKey: 'rentals.pricing.view' },
        });
        const read = await fetch(root + '/' + row.id, { headers });
        assert.equal(read.status, 200);
        assert.equal(read.headers.get('cache-control'), 'no-store');
        assert.ok(!('agreedRate' in (await read.json()).items[0]));
        assert.equal(
          (
            await fetch(root + '/' + row.id, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ status: 'ACTIVE' }),
            })
          ).status,
          409,
        );
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
            roles: { create: { roleId: platformRole.id } },
          },
        });
        await db.rolePermission.deleteMany({
          where: { roleId: t.role.id, permissionKey: { in: keys } },
        });
        assert.equal((await fetch(root, { headers })).status, 403);
      } finally {
        await app.close();
      }
    },
  );
  await suite.test(
    'reserved and rented model corrections preserve assignment, state and audit; incompatible requirements roll back',
    async () => {
      const t = await tenant();
      const row = await create(t, [
        item(t, { requestedCategoryId: t.machine.categoryId }),
      ]);
      const reserved = await reserve(t, row.id);
      const update = (body) =>
        machines.update(
          t.principal,
          t.organization.id,
          t.machine.id,
          body,
          randomUUID(),
        );
      const corrected = await update({
        model: 'Corrected ES1012',
        specifications: { workingHeightM: 12 },
      });
      assert.equal(corrected.rentalState, 'RESERVED');
      assert.equal(corrected.model, 'Corrected ES1012');
      await call(t, 'dispatch', row.id, {
        assignmentIds: reserved.items[0].assignments.map((a) => a.id),
        actualStartAt: start,
      });
      const rented = await update({ model: 'Final ES1012' });
      assert.equal(rented.rentalState, 'RENTED');
      await assert.rejects(update({ category: 'Forklift' }), {
        code: 'MACHINE_COMMITMENT_CONFLICT',
      });
      await assert.rejects(update({ branchId: null }), {
        code: 'MACHINE_COMMITMENT_CONFLICT',
      });
      const saved = await machines.get(
        t.principal,
        t.organization.id,
        t.machine.id,
      );
      assert.equal(saved.category, t.machine.category);
      assert.equal(saved.branchId, t.branch.id);
      const audit = await db.auditEvent.findFirst({
        where: {
          targetId: t.machine.id,
          action: 'MACHINE_UPDATED',
          metadata: { path: ['nextModelId'], equals: rented.modelId },
        },
      });
      assert.equal(audit.metadata.previousModelId, corrected.modelId);
      const rental = await service.get(t.principal, t.organization.id, row.id);
      assert.equal(
        rental.items[0].assignments[0].id,
        reserved.items[0].assignments[0].id,
      );
    },
  );
  await suite.test(
    'exact-model commitments and minimum specifications cannot be invalidated by edits',
    async () => {
      const t = await tenant();
      await machines.update(
        t.principal,
        t.organization.id,
        t.machine.id,
        { specifications: { workingHeightM: 12 } },
        randomUUID(),
      );
      const row = await create(t, [
        item(t, {
          requestedModelId: t.machine.modelId,
          specifications: { workingHeightM: 10 },
        }),
      ]);
      await reserve(t, row.id);
      for (const body of [
        { model: 'Other model' },
        { specifications: { workingHeightM: 8 } },
      ]) {
        await assert.rejects(
          machines.update(
            t.principal,
            t.organization.id,
            t.machine.id,
            body,
            randomUUID(),
          ),
          { code: 'MACHINE_COMMITMENT_CONFLICT' },
        );
      }
      const updated = await machines.update(
        t.principal,
        t.organization.id,
        t.machine.id,
        { specifications: { workingHeightM: 14 } },
        randomUUID(),
      );
      assert.equal(updated.specifications.workingHeightM, 14);
    },
  );
  await suite.test(
    'unallocated reservations protect capacity during machine edits and retirement',
    async () => {
      const t = await tenant();
      const row = await create(t, [
        item(t, { machineIds: [], requestedModelId: t.machine.modelId }),
      ]);
      await reserve(t, row.id);
      assert.equal(await state(t), 'NOT_RENTED');
      await assert.rejects(
        machines.update(
          t.principal,
          t.organization.id,
          t.machine.id,
          { model: 'Other' },
          randomUUID(),
        ),
        { code: 'MACHINE_COMMITMENT_CONFLICT' },
      );
      await assert.rejects(
        machines.archive(
          t.principal,
          t.organization.id,
          t.machine.id,
          {},
          randomUUID(),
        ),
        { code: 'MACHINE_COMMITMENT_CONFLICT' },
      );
      await machine(t);
      const moved = await machines.update(
        t.principal,
        t.organization.id,
        t.machine.id,
        { model: 'Other' },
        randomUUID(),
      );
      assert.equal(moved.model, 'Other');
    },
  );
  await suite.test(
    'concurrent machine edit and model reservation cannot invalidate a commitment',
    async () => {
      const t = await tenant();
      const row = await create(t, [
        item(t, { machineIds: [], requestedModelId: t.machine.modelId }),
      ]);
      const results = await Promise.allSettled([
        reserve(t, row.id),
        machines.update(
          t.principal,
          t.organization.id,
          t.machine.id,
          { model: 'Other' },
          randomUUID(),
        ),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const failure = results.find((r) => r.status === 'rejected').reason;
      assert.ok(
        ['CONFLICT', 'RENTAL_CONFLICT', 'MACHINE_COMMITMENT_CONFLICT'].includes(
          failure.code,
        ),
      );
    },
  );
}
