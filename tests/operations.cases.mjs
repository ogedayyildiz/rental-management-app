import assert from 'node:assert/strict';
import { OperationsService } from '../apps/api/dist/operations/operations.service.js';
import { PrismaOperationsUnitOfWork } from '../apps/api/dist/infrastructure/prisma.operations.js';
import { tenantPermissions } from '../packages/permissions/dist/index.js';
import { operationsFixtures } from './operations-fixtures.mjs';
import { createOperationsClient } from '../packages/api-client/dist/index.js';
export async function operationsCases(suite, db, fixture, h) {
  const a = await fixture(),
    b = await fixture(),
    org = a.organization.id,
    now = new Date();
  await db.rolePermission.createMany({
    data: tenantPermissions.map((permissionKey) => ({
      organizationId: org,
      roleId: a.role.id,
      permissionKey,
    })),
    skipDuplicates: true,
  });
  const south = await db.branch.create({
    data: { organizationId: org, name: 'South' },
  });
  const data = await operationsFixtures(
    db,
    a.principal,
    org,
    a.branch.id,
    south.id,
    now,
  );
  const service = new OperationsService(
      new PrismaOperationsUnitOfWork(db),
      () => now,
    ),
    dashboard = (q = {}) => service.dashboard(a.principal, org, q);
  const metric = (r, key) => r.metrics.find((m) => m.key === key)?.value;
  await suite.test(
    'operations: scoped totals, overdue sources and no commercial values',
    async () => {
      const r = await dashboard();
      assert.equal(metric(r, 'activeRentals'), 2);
      assert.equal(metric(r, 'overdueRentals'), 2);
      assert.equal(metric(r, 'overdueMaintenance'), 2);
      assert.equal(metric(r, 'offlineMachines'), 1);
      assert.equal(metric(r, 'activeFaults'), 1);
      assert.equal(
        r.attention.some((a) => a.kind === 'LOW_BATTERY'),
        false,
      );
      assert.ok(
        r.attention
          .find((a) => a.sourceId === data.north.rental.id)
          .href.includes(org),
      );
      assert.ok(
        !/agreedRate|acquisitionCost|123456|costs|currency/.test(
          JSON.stringify(r),
        ),
      );
      assert.equal(
        metric(await dashboard({ branchId: a.branch.id }), 'activeRentals'),
        1,
      );
    },
  );
  await suite.test(
    'operations: tenant isolation and interaction composite FK',
    async () => {
      await assert.rejects(service.dashboard(b.principal, org, {}), {
        code: 'ACCESS_DENIED',
      });
      const key = (await dashboard()).notifications[0].key;
      await assert.rejects(
        service.interact(b.principal, b.organization.id, key, {
          action: 'READ',
        }),
        { code: 'NOT_FOUND' },
      );
      await assert.rejects(
        db.notificationInteraction.create({
          data: {
            organizationId: b.organization.id,
            membershipId: a.membership.id,
            key,
          },
        }),
      );
      await assert.rejects(async () => dashboard({ branchId: 'invalid' }), {
        code: 'INVALID_INPUT',
      });
    },
  );
  await suite.test(
    'operations: notification read/acknowledge/dismiss is personal and does not resolve domain state',
    async () => {
      const item = (await dashboard()).notifications.find(
        (n) => n.sourceId === data.north.rental.id,
      );
      await service.interact(a.principal, org, item.key, {
        action: 'ACKNOWLEDGE',
      });
      let r = await dashboard();
      assert.ok(r.notifications.find((n) => n.key === item.key).acknowledgedAt);
      assert.equal(metric(r, 'overdueRentals'), 2);
      await service.interact(a.principal, org, item.key, { action: 'UNREAD' });
      assert.equal(
        (await dashboard()).notifications.find((n) => n.key === item.key)
          .readAt,
        null,
      );
      await service.interact(a.principal, org, item.key, { action: 'DISMISS' });
      r = await dashboard();
      assert.ok(!r.notifications.some((n) => n.key === item.key));
      assert.ok(r.attention.some((n) => n.key === item.key));
      const secondMember = await db.membership.create({
        data: {
          organizationId: org,
          userId: b.user.id,
          status: 'ACTIVE',
          branchScope: 'ALL_BRANCHES',
        },
      });
      await db.membershipRole.create({
        data: {
          organizationId: org,
          membershipId: secondMember.id,
          roleId: a.role.id,
        },
      });
      const personal = await service.dashboard(b.principal, org, {});
      assert.equal(
        personal.notifications.find((n) => n.key === item.key).readAt,
        null,
      );
      assert.equal(
        (await db.rental.findUnique({ where: { id: data.north.rental.id } }))
          .status,
        'ACTIVE',
      );
    },
  );
  await suite.test(
    'operations: preferences mute delivery but never counts; invalid thresholds rejected',
    async () => {
      await service.savePreferences(a.principal, org, {
        enabled: true,
        domains: ['MAINTENANCE'],
        lowSocPercent: 15,
      });
      const r = await dashboard();
      assert.ok(r.notifications.every((n) => n.domain === 'MAINTENANCE'));
      assert.equal(metric(r, 'activeRentals'), 2);
      await assert.rejects(
        async () =>
          service.savePreferences(a.principal, org, { lowSocPercent: 101 }),
        { code: 'INVALID_INPUT' },
      );
    },
  );
  await suite.test(
    'operations: selected branches constrain totals, search and notification mutations',
    async () => {
      await db.membership.update({
        where: { id: a.membership.id },
        data: { branchScope: 'SELECTED_BRANCHES' },
      });
      await db.membershipBranch.create({
        data: {
          organizationId: org,
          membershipId: a.membership.id,
          branchId: a.branch.id,
        },
      });
      const r = await dashboard();
      assert.equal(metric(r, 'activeRentals'), 1);
      assert.equal(metric(r, 'overdueMaintenance'), 1);
      assert.ok(!JSON.stringify(r).includes(data.south.rental.id));
      await assert.rejects(dashboard({ branchId: south.id }), {
        code: 'ACCESS_DENIED',
      });
      assert.equal(
        (await service.search(a.principal, org, { q: 'OPS-SOUTH' })).items
          .length,
        0,
      );
      await assert.rejects(
        service.interact(a.principal, org, '0'.repeat(64), { action: 'READ' }),
        { code: 'NOT_FOUND' },
      );
    },
  );
  await suite.test(
    'operations: source permissions are re-evaluated and no dashboard permission bypass exists',
    async () => {
      await db.rolePermission.deleteMany({
        where: {
          organizationId: org,
          roleId: a.role.id,
          permissionKey: {
            in: [
              'rentals.read',
              'maintenance.read',
              'telemetry.read',
              'device.read',
            ],
          },
        },
      });
      const r = await dashboard();
      assert.equal(r.attention.length, 0);
      assert.equal(metric(r, 'activeRentals'), undefined);
      assert.equal(metric(r, 'activeFaults'), undefined);
      assert.equal(metric(r, 'availableMachines'), undefined);
      assert.equal(
        (
          await service.search(a.principal, org, {
            q: data.north.rental.number,
          })
        ).items.length,
        0,
      );
      assert.ok(
        (await service.search(a.principal, org, { q: 'OPS-NORTH' })).items.some(
          (i) => i.id === data.north.machine.id,
        ),
      );
    },
  );
  await suite.test(
    'operations: real HTTP authorization and shared UI response contracts',
    async () => {
      const module = await h.Test.createTestingModule({
        imports: [h.FoundationModule],
      })
        .overrideProvider(h.DATABASE)
        .useValue(db)
        .overrideProvider(h.IdentityVerifier)
        .useClass(h.TestVerifier)
        .compile();
      const app = module.createNestApplication({ logger: false });
      await app.listen(0, '127.0.0.1');
      try {
        const url = await app.getUrl();
        const client = createOperationsClient(url, (path, options) =>
          fetch(path, {
            ...options,
            headers: {
              ...options?.headers,
              authorization: `Bearer test-${a.user.id}`,
            },
          }),
        );
        assert.ok((await client.dashboard(org)).metrics.length > 0);
        assert.ok((await client.search(org, 'OPS-NORTH')).items.length > 0);
        assert.equal(
          (await fetch(`${url}/organizations/${org}/operations`)).status,
          401,
        );
      } finally {
        await app.close();
      }
    },
  );
}
