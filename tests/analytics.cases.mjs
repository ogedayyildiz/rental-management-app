import assert from 'node:assert/strict';
import { URLSearchParams } from 'node:url';
import { createRequire } from 'node:module';
import { AnalyticsService } from '../apps/api/dist/analytics/analytics.service.js';
import { PrismaFinanceUnitOfWork } from '../apps/api/dist/infrastructure/prisma.finance.js';
import { analyticsExport } from '../apps/api/dist/infrastructure/analytics-export.js';
import { createAnalyticsClient } from '../packages/api-client/dist/index.js';
import { tenantPermissions } from '../packages/permissions/dist/index.js';
import { financeFixtures } from './finance-fixtures.mjs';
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const query = {
  preset: 'CUSTOM',
  from: '2026-01-01T00:00:00Z',
  to: '2026-02-01T00:00:00Z',
};
export async function analyticsCases(suite, db, fixture, h) {
  const t = await fixture(),
    other = await fixture(),
    org = t.organization.id;
  await db.rolePermission.createMany({
    data: tenantPermissions.map((permissionKey) => ({
      organizationId: org,
      roleId: t.role.id,
      permissionKey,
    })),
    skipDuplicates: true,
  });
  const data = await financeFixtures(db, t.principal, org, t.branch.id);
  const service = new AnalyticsService(
    new PrismaFinanceUnitOfWork(db),
    () => new Date('2026-02-01T00:00:00Z'),
  );
  const report = (q = {}) =>
    service.report(t.principal, org, { ...query, ...q });
  await suite.test(
    'finance scoped reads, exact estimates, costs, recovery and mixed currencies',
    async () => {
      const r = await report({ machineId: data.machines[0].id });
      assert.equal(r.valuationPolicy, 'ESTIMATE_V1');
      assert.equal(r.summary.values[0].estimatedContractedValue, '1200');
      assert.equal(r.summary.values[0].estimatedCompletedValue, '600');
      assert.equal(r.summary.values[0].maintenanceCost, '100');
      assert.equal(r.summary.values[0].estimatedContribution, '500');
      assert.equal(r.items[0].lifetime.recovery.percentage, '50');
      assert.equal(r.items[0].utilization.rentedSeconds, 86400);
      assert.ok(
        !(
          'lifetime' in
          (
            await report({
              machineId: data.machines[0].id,
              branchId: t.branch.id,
            })
          ).items[0]
        ),
      );
      assert.equal(
        (await report({ machineId: data.machines[1].id })).items[0].lifetime
          .recovery.percentage,
        null,
      );
      assert.equal(
        (await report({ machineId: data.machines[2].id })).items[0].lifetime
          .recovery,
        null,
      );
      const mixed = (await report({ machineId: data.machines[3].id })).items[0];
      assert.equal(mixed.mixedCurrencies, true);
      assert.equal(mixed.lifetime.recovery, null);
      assert.deepEqual(
        mixed.values.map((v) => v.currency),
        ['EUR', 'TRY'],
      );
      const customers = await report({
        group: 'customer',
        customerId: data.customer.id,
      });
      assert.equal(customers.items[0].rentalCount, 4);
      assert.ok(!('maintenanceCost' in customers.items[0].values[0]));
      assert.ok(!('acquisitionCost' in customers.items[0]));
    },
  );
  await suite.test(
    'finance keyset pagination has no duplicates and filters preserve tenant/branch scope',
    async () => {
      const first = await report({ limit: 2 }),
        next = await report({ limit: 2, cursor: first.nextCursor });
      assert.equal(first.items.length, 2);
      assert.equal(next.items.length, 2);
      assert.equal(
        new Set([...first.items, ...next.items].map((r) => r.id)).size,
        4,
      );
      assert.equal(next.nextCursor, null);
      await assert.rejects(
        service.report(t.principal, other.organization.id, query),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(service.report(other.principal, org, query), {
        code: 'ACCESS_DENIED',
      });
      await assert.rejects(report({ customerId: other.user.id }), {
        code: 'NOT_FOUND',
      });
      await db.membership.update({
        where: { id: t.membership.id },
        data: { branchScope: 'SELECTED_BRANCHES' },
      });
      assert.equal((await report()).items.length, 0);
      await assert.rejects(report({ machineId: data.machines[0].id }), {
        code: 'NOT_FOUND',
      });
      await assert.rejects(report({ branchId: t.branch.id }), {
        code: 'ACCESS_DENIED',
      });
      await db.membershipBranch.create({
        data: {
          organizationId: org,
          membershipId: t.membership.id,
          branchId: t.branch.id,
        },
      });
      const restricted = await report();
      assert.equal(restricted.items.length, 4);
      assert.ok(restricted.items.every((row) => !('lifetime' in row)));
      await db.membership.update({
        where: { id: t.membership.id },
        data: { branchScope: 'ALL_BRANCHES' },
      });
    },
  );
  await suite.test(
    'finance partial permissions prevent direct and derived leaks in API and XLSX',
    async () => {
      for (const permission of [
        'finance.acquisition_cost.view',
        'rentals.pricing.view',
        'maintenance.costs.view',
      ]) {
        await db.rolePermission.deleteMany({
          where: {
            organizationId: org,
            roleId: t.role.id,
            permissionKey: permission,
          },
        });
        const r = await report({ machineId: data.machines[0].id }),
          text = JSON.stringify(r);
        if (permission === 'finance.acquisition_cost.view') {
          assert.ok(!text.includes('acquisitionCost'));
          assert.ok(!text.includes('recovery'));
        }
        if (permission === 'rentals.pricing.view') {
          assert.ok(!text.includes('estimatedCompletedValue'));
          assert.ok(!text.includes('estimatedContribution'));
        }
        if (permission === 'maintenance.costs.view') {
          assert.ok(!text.includes('maintenanceCost'));
          assert.ok(!text.includes('estimatedContribution'));
        }
        const bytes = await analyticsExport(r),
          Excel = requireApi('exceljs'),
          book = new Excel.Workbook();
        await book.xlsx.load(bytes);
        const cells = JSON.stringify(
          book.worksheets.map((s) => s.getSheetValues()),
        );
        if (permission === 'finance.acquisition_cost.view')
          assert.ok(!cells.includes('Fleet acquisition cost baseline'));
        if (permission === 'rentals.pricing.view')
          assert.ok(!cells.includes('Estimated Completed Rental Value'));
        if (permission === 'maintenance.costs.view')
          assert.ok(!cells.includes('Recorded maintenance cost'));
        await db.rolePermission.create({
          data: {
            organizationId: org,
            roleId: t.role.id,
            permissionKey: permission,
          },
        });
      }
      await db.rolePermission.deleteMany({
        where: {
          organizationId: org,
          roleId: t.role.id,
          permissionKey: 'finance.analytics.export',
        },
      });
      await assert.rejects(service.report(t.principal, org, query, true), {
        code: 'ACCESS_DENIED',
      });
      await db.rolePermission.deleteMany({
        where: {
          organizationId: org,
          roleId: t.role.id,
          permissionKey: 'finance.analytics.view',
        },
      });
      await assert.rejects(report(), { code: 'ACCESS_DENIED' });
      await db.rolePermission.createMany({
        data: ['finance.analytics.view', 'finance.analytics.export'].map(
          (permissionKey) => ({
            organizationId: org,
            roleId: t.role.id,
            permissionKey,
          }),
        ),
      });
    },
  );
  await suite.test(
    'finance authenticated HTTP/shared-client contract, branch bypass and export permission',
    async () => {
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
        const base = await app.getUrl(),
          auth = { authorization: `Bearer test-${t.user.id}` };
        const client = createAnalyticsClient(base, (url, init) =>
          fetch(url, { ...init, headers: auth }),
        );
        const r = await client.report(
          org,
          new URLSearchParams({ ...query, machineId: data.machines[0].id }),
        );
        assert.equal(r.summary.values[0].estimatedCompletedValue, '600');
        assert.equal(
          (
            await fetch(
              `${base}/organizations/${other.organization.id}/finance`,
              { headers: auth },
            )
          ).status,
          403,
        );
        assert.equal(
          (await fetch(`${base}/organizations/${org}/finance`)).status,
          401,
        );
        const exported = await fetch(
          client.exportUrl(org, new URLSearchParams(query)),
          { headers: auth },
        );
        assert.equal(exported.status, 200);
        assert.match(exported.headers.get('content-type'), /spreadsheetml/);
        assert.ok((await exported.arrayBuffer()).byteLength > 2000);
      } finally {
        await app.close();
      }
    },
  );
}
