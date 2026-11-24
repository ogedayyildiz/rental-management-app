import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tenantPermissions } from '../packages/permissions/dist/index.js';
import { AdministrationService } from '../apps/api/dist/administration/administration.service.js';
import { PrismaAdministrationUnitOfWork } from '../apps/api/dist/infrastructure/prisma.administration.js';
import {
  PrismaAccessRepository,
  PrismaFoundationUnitOfWork,
} from '../apps/api/dist/infrastructure/prisma.repositories.js';
import { AccessService } from '../apps/api/dist/access/access.service.js';
import { BranchService } from '../apps/api/dist/branches/branch.service.js';
import { OnboardingService } from '../apps/api/dist/onboarding/onboarding.service.js';
import { PrismaOnboardingUnitOfWork } from '../apps/api/dist/infrastructure/prisma.onboarding.js';
export async function administrationCases(suite, db, fixture, nest) {
  const uow = new PrismaAdministrationUnitOfWork(db),
    service = new AdministrationService(uow),
    access = new AccessService(new PrismaAccessRepository(db));
  const core = [
    'organization.manage',
    'users.manage',
    'roles.manage',
    'branches.manage',
  ];
  async function admin() {
    const a = await fixture();
    await db.rolePermission.createMany({
      data: tenantPermissions.map((permissionKey) => ({
        organizationId: a.organization.id,
        roleId: a.role.id,
        permissionKey,
      })),
      skipDuplicates: true,
    });
    return a;
  }
  async function member(a, keys = []) {
    const user = await db.user.create({
      data: { name: 'Managed member', email: randomUUID() + '@example.test' },
    });
    const role = await service.createRole(
      a.principal,
      a.organization.id,
      { name: randomUUID(), permissions: keys },
      randomUUID(),
    );
    const m = await db.membership.create({
      data: {
        organizationId: a.organization.id,
        userId: user.id,
        status: 'ACTIVE',
        branchScope: 'ALL_BRANCHES',
        roles: { create: { roleId: role.id } },
      },
    });
    return {
      user,
      role,
      member: await service.member(a.principal, a.organization.id, m.id),
    };
  }
  const update = (a, m, body) =>
    service.updateMember(
      a.principal,
      a.organization.id,
      m.id,
      { version: m.updatedAt, ...body },
      randomUUID(),
    );
  await suite.test(
    'administration: settings validate known fields, optimistic versions and audit atomically',
    async () => {
      const a = await admin(),
        o = a.organization.id,
        s = await service.organization(a.principal, o);
      const row = await service.updateOrganization(
        a.principal,
        o,
        {
          version: s.updatedAt,
          name: 'Updated',
          defaultCurrency: 'EUR',
          timezone: 'Europe/Berlin',
        },
        randomUUID(),
      );
      assert.equal(row.name, 'Updated');
      assert.equal(row.defaultCurrency, 'EUR');
      await assert.rejects(
        service.updateOrganization(
          a.principal,
          o,
          { version: s.updatedAt, name: 'stale' },
          randomUUID(),
        ),
        { code: 'CONFLICT' },
      );
      await assert.rejects(
        service.updateOrganization(
          a.principal,
          o,
          { version: row.updatedAt, status: 'SUSPENDED' },
          randomUUID(),
        ),
        { code: 'INVALID_INPUT' },
      );
      assert.equal(
        await db.auditEvent.count({
          where: { organizationId: o, action: 'ORGANIZATION_SETTINGS_CHANGED' },
        }),
        1,
      );
    },
  );
  await suite.test(
    'administration: tenant roles reject platform, unknown and unheld grants; assigned roles cannot be disabled',
    async () => {
      const a = await admin();
      for (const key of ['platform.organization.create', 'unknown.permission'])
        await assert.rejects(
          service.createRole(
            a.principal,
            a.organization.id,
            { name: 'Invalid', permissions: [key] },
            randomUUID(),
          ),
          { code: 'ACCESS_DENIED' },
        );
      const target = await member(a, ['customers.read']);
      await assert.rejects(
        service.updateRole(
          a.principal,
          a.organization.id,
          target.role.id,
          { version: target.role.updatedAt, enabled: false },
          randomUUID(),
        ),
        { code: 'ROLE_IN_USE' },
      );
      const limited = await fixture();
      await assert.rejects(
        service.createRole(
          limited.principal,
          limited.organization.id,
          { name: 'Nope', permissions: ['customers.read'] },
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
      await db.rolePermission.create({
        data: {
          organizationId: limited.organization.id,
          roleId: limited.role.id,
          permissionKey: 'roles.manage',
        },
      });
      await assert.rejects(
        service.createRole(
          limited.principal,
          limited.organization.id,
          {
            name: 'Escalation',
            permissions: ['finance.acquisition_cost.view'],
          },
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
    },
  );
  await suite.test(
    'administration: membership roles, scopes and status change fresh authorization without new identity tokens',
    async () => {
      const a = await admin(),
        m = await member(a, ['machines.read']);
      const r = await service.createRole(
        a.principal,
        a.organization.id,
        {
          name: 'Operational',
          permissions: ['customers.read', 'rentals.read'],
        },
        randomUUID(),
      );
      const selected = await update(a, m.member, {
        roleIds: [r.id],
        branchScope: 'SELECTED_BRANCHES',
        branchIds: [a.branch.id],
      });
      let effective = await new PrismaAccessRepository(db).findTenantAccess(
        m.user.id,
        a.organization.id,
      );
      assert.deepEqual(
        new Set(effective.permissions),
        new Set(['customers.read', 'rentals.read']),
      );
      assert.deepEqual(effective.branchIds, [a.branch.id]);
      const changed = await service.updateRole(
        a.principal,
        a.organization.id,
        r.id,
        { version: r.updatedAt, permissions: ['machines.read'] },
        randomUUID(),
      );
      assert.ok(changed);
      effective = await new PrismaAccessRepository(db).findTenantAccess(
        m.user.id,
        a.organization.id,
      );
      assert.deepEqual(effective.permissions, ['machines.read']);
      const inactive = await update(a, selected, { status: 'INACTIVE' });
      assert.equal(
        await new PrismaAccessRepository(db).findTenantAccess(
          m.user.id,
          a.organization.id,
        ),
        null,
      );
      await update(a, inactive, {
        status: 'ACTIVE',
        branchScope: 'ALL_BRANCHES',
        branchIds: [],
      });
      assert.equal(
        (
          await new PrismaAccessRepository(db).findTenantAccess(
            m.user.id,
            a.organization.id,
          )
        ).branchScope,
        'ALL_BRANCHES',
      );
    },
  );
  await suite.test(
    'administration: cross-tenant member, role, branch and organization IDs cannot be used',
    async () => {
      const a = await admin(),
        b = await admin(),
        m = await member(a);
      await assert.rejects(
        service.organization(a.principal, b.organization.id),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(
        service.member(a.principal, a.organization.id, b.membership.id),
        { code: 'NOT_FOUND' },
      );
      await assert.rejects(update(a, m.member, { roleIds: [b.role.id] }), {
        code: 'INVALID_INPUT',
      });
      await assert.rejects(
        update(a, m.member, {
          branchScope: 'SELECTED_BRANCHES',
          branchIds: [b.branch.id],
        }),
        { code: 'INVALID_INPUT' },
      );
      await assert.rejects(
        service.updateRole(
          a.principal,
          a.organization.id,
          b.role.id,
          { version: b.role.updatedAt.toISOString(), name: 'Nope' },
          randomUUID(),
        ),
        { code: 'NOT_FOUND' },
      );
    },
  );
  await suite.test(
    'administration: last administrator protected across membership status, role removal, branch scope and permission removal',
    async () => {
      const a = await admin(),
        m = await service.member(
          a.principal,
          a.organization.id,
          a.membership.id,
        );
      for (const body of [
        { status: 'INACTIVE' },
        { roleIds: [] },
        { branchScope: 'SELECTED_BRANCHES', branchIds: [a.branch.id] },
      ])
        await assert.rejects(update(a, m, body), { code: 'ADMIN_LOCKOUT' });
      const r = (await service.roles(a.principal, a.organization.id, {}))
        .items[0];
      await assert.rejects(
        service.updateRole(
          a.principal,
          a.organization.id,
          r.id,
          {
            version: r.updatedAt,
            permissions: tenantPermissions.filter((k) => k !== 'roles.manage'),
          },
          randomUUID(),
        ),
        { code: 'ADMIN_LOCKOUT' },
      );
      assert.equal(
        (await access.tenant(a.principal, a.organization.id)).branchScope,
        'ALL_BRANCHES',
      );
    },
  );
  await suite.test(
    'administration: administrator capability is collective enabled grants, not a role name',
    async () => {
      const a = await admin();
      const m = await member(a, core.slice(0, 2));
      const extra = await service.createRole(
        a.principal,
        a.organization.id,
        { name: 'Not an admin label', permissions: core.slice(2) },
        randomUUID(),
      );
      await update(a, m.member, { roleIds: [m.role.id, extra.id] });
      const self = await service.member(
        a.principal,
        a.organization.id,
        a.membership.id,
      );
      await update(a, self, { status: 'INACTIVE' });
      assert.equal(
        await new PrismaAccessRepository(db).findTenantAccess(
          a.user.id,
          a.organization.id,
        ),
        null,
      );
    },
  );
  await suite.test(
    'administration: concurrent independent admin removals cannot remove all administrative capability',
    async () => {
      const a = await admin(),
        m = await member(a, core),
        self = await service.member(
          a.principal,
          a.organization.id,
          a.membership.id,
        );
      const result = await Promise.allSettled([
        update(a, self, { status: 'INACTIVE' }),
        update(a, m.member, { status: 'INACTIVE' }),
      ]);
      assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
      const remaining = await db.membership.count({
        where: {
          organizationId: a.organization.id,
          status: 'ACTIVE',
          branchScope: 'ALL_BRANCHES',
        },
      });
      assert.equal(remaining, 1);
    },
  );
  await suite.test(
    'administration: selected-branch admin grants do not confer organization-wide management',
    async () => {
      const a = await admin();
      await db.membership.update({
        where: { id: a.membership.id },
        data: {
          branchScope: 'SELECTED_BRANCHES',
          branches: { create: { branchId: a.branch.id } },
        },
      });
      for (const fn of [
        () => service.organization(a.principal, a.organization.id),
        () => service.members(a.principal, a.organization.id, {}),
        () => service.roles(a.principal, a.organization.id, {}),
        () => service.audit(a.principal, a.organization.id, {}),
      ])
        await assert.rejects(fn(), { code: 'ACCESS_DENIED' });
      assert.equal(
        (await service.branches(a.principal, a.organization.id, {})).items
          .length,
        1,
      );
      const other = await db.branch.create({
        data: { organizationId: a.organization.id, name: 'Excluded' },
      });
      assert.ok(
        !(
          await service.branches(a.principal, a.organization.id, {})
        ).items.some((b) => b.id === other.id),
      );
      await new BranchService(new PrismaFoundationUnitOfWork(db)).rename(
        a.principal,
        a.organization.id,
        a.branch.id,
        { name: 'Scoped edit' },
        randomUUID(),
      );
    },
  );
  await suite.test(
    'administration: inactive branches preserve historical member scope and reject new grants',
    async () => {
      const a = await admin(),
        m = await member(a);
      const selected = await update(a, m.member, {
        branchScope: 'SELECTED_BRANCHES',
        branchIds: [a.branch.id],
      });
      await new BranchService(new PrismaFoundationUnitOfWork(db)).rename(
        a.principal,
        a.organization.id,
        a.branch.id,
        { active: false },
        randomUUID(),
      );
      assert.deepEqual(
        (
          await new PrismaAccessRepository(db).findTenantAccess(
            m.user.id,
            a.organization.id,
          )
        ).branchIds,
        [a.branch.id],
      );
      await assert.rejects(update(a, selected, { branchIds: [a.branch.id] }), {
        code: 'INVALID_INPUT',
      });
      await update(a, selected, { status: 'INACTIVE' });
    },
  );
  await suite.test(
    'administration: disabled global users cannot be activated through tenant management',
    async () => {
      const a = await admin(),
        m = await member(a);
      await db.user.update({
        where: { id: m.user.id },
        data: { status: 'DISABLED' },
      });
      await assert.rejects(update(a, m.member, { status: 'ACTIVE' }), {
        code: 'INVALID_INPUT',
      });
      await update(a, m.member, { status: 'INACTIVE' });
      assert.equal(
        (await db.user.findUnique({ where: { id: m.user.id } })).status,
        'DISABLED',
      );
    },
  );
  await suite.test(
    'administration: invitation reads omit token hashes, expiry is derived, assigned pending roles cannot disable',
    async () => {
      const a = await admin(),
        role = await service.createRole(
          a.principal,
          a.organization.id,
          { name: 'Invite role', permissions: ['customers.read'] },
          randomUUID(),
        );
      const onboarding = new OnboardingService(
        new PrismaOnboardingUnitOfWork(db),
        { verifyInvitationIdentity: async () => null },
      );
      const issued = await onboarding.invite(
        a.principal,
        a.organization.id,
        {
          email: 'new@example.test',
          roleIds: [role.id],
          branchScope: 'ALL_BRANCHES',
          branchIds: [],
        },
        randomUUID(),
      );
      let page = await service.invitations(a.principal, a.organization.id, {
        status: 'PENDING',
      });
      assert.equal(page.items[0].id, issued.invitationId);
      assert.ok(!JSON.stringify(page).includes('token'));
      await assert.rejects(
        service.updateRole(
          a.principal,
          a.organization.id,
          role.id,
          { version: role.updatedAt, enabled: false },
          randomUUID(),
        ),
        { code: 'ROLE_IN_USE' },
      );
      await db.organizationInvitation.update({
        where: { id: issued.invitationId },
        data: {
          createdAt: new Date(Date.now() - 100000),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      page = await service.invitations(a.principal, a.organization.id, {
        status: 'EXPIRED',
      });
      assert.equal(page.items[0].status, 'EXPIRED');
      await onboarding.revoke(
        a.principal,
        a.organization.id,
        issued.invitationId,
        randomUUID(),
      );
      assert.equal(
        (
          await service.invitations(a.principal, a.organization.id, {
            status: 'REVOKED',
          })
        ).items.length,
        1,
      );
    },
  );
  await suite.test(
    'administration: audit failure rolls back role, membership and organization mutations',
    async () => {
      const a = await admin(),
        m = await member(a);
      const failing = new AdministrationService({
        run: (fn) =>
          uow.run((r) => {
            r.admin.audit = async () => {
              throw Error('audit unavailable');
            };
            return fn(r);
          }),
      });
      await assert.rejects(
        failing.createRole(
          a.principal,
          a.organization.id,
          { name: 'Rollback', permissions: [] },
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(
        await db.role.count({
          where: { organizationId: a.organization.id, name: 'Rollback' },
        }),
        0,
      );
      await assert.rejects(
        failing.updateMember(
          a.principal,
          a.organization.id,
          m.member.id,
          { version: m.member.updatedAt, status: 'INACTIVE' },
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(
        (await service.member(a.principal, a.organization.id, m.member.id))
          .status,
        'ACTIVE',
      );
      const o = await service.organization(a.principal, a.organization.id);
      await assert.rejects(
        failing.updateOrganization(
          a.principal,
          a.organization.id,
          { version: o.updatedAt, name: 'Rollback' },
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(
        (await service.organization(a.principal, a.organization.id)).name,
        o.name,
      );
    },
  );
  await suite.test(
    'administration: audit API filters and pages without disclosing raw financial or secret metadata',
    async () => {
      const a = await admin();
      await service.createBranch(
        a.principal,
        a.organization.id,
        { name: 'Audit branch' },
        randomUUID(),
      );
      await db.auditEvent.create({
        data: {
          organizationId: a.organization.id,
          actorType: 'USER',
          actorUserId: a.user.id,
          action: 'CUSTOMER_UPDATED',
          targetType: 'Customer',
          targetId: randomUUID(),
          result: 'SUCCESS',
          source: 'test',
          requestId: randomUUID(),
          metadata: { secret: 'never-return', acquisitionCost: '999.99' },
        },
      });
      const p = await service.audit(a.principal, a.organization.id, {
        limit: 1,
      });
      assert.equal(p.items.length, 1);
      const q = await service.audit(a.principal, a.organization.id, {
        limit: 1,
        cursor: p.nextCursor,
      });
      assert.notEqual(q.items[0].id, p.items[0].id);
      assert.ok(!JSON.stringify([p, q]).includes('never-return'));
      assert.ok(!JSON.stringify([p, q]).includes('999.99'));
      assert.equal(
        (
          await service.audit(a.principal, a.organization.id, {
            domain: 'ADMINISTRATION',
            action: 'BRANCH_CREATED',
            actorId: a.user.id,
          })
        ).items.length,
        1,
      );
    },
  );
  await suite.test(
    'administration: REST guards and platform boundary, role grants immediately redact machine acquisition fields',
    async () => {
      const a = await admin(),
        other = await fixture();
      const {
        Test,
        FoundationModule,
        DATABASE,
        IdentityVerifier,
        TestVerifier,
      } = nest;
      const module = await Test.createTestingModule({
        imports: [FoundationModule],
      })
        .overrideProvider(DATABASE)
        .useValue(db)
        .overrideProvider(IdentityVerifier)
        .useValue(new TestVerifier())
        .compile();
      const app = module.createNestApplication({ logger: false });
      await app.listen(0, '127.0.0.1');
      try {
        const base = await app.getUrl();
        const call = async (user, path, method = 'GET', body) => {
          const r = await fetch(
            `${base}/organizations/${a.organization.id}/${path}`,
            {
              method,
              headers: {
                authorization: `Bearer test-${user.id}`,
                'content-type': 'application/json',
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            },
          );
          return { status: r.status, body: await r.json() };
        };
        assert.equal((await call(other.user, 'roles')).status, 403);
        const r = await call(a.user, 'roles');
        assert.equal(r.status, 200);
        const c = await call(a.user, 'roles', 'POST', {
          name: 'HTTP role',
          permissions: ['platform.organization.create'],
        });
        assert.equal(c.status, 403);
        const machine = await call(a.user, 'machines', 'POST', {
          fleetNumber: randomUUID(),
          manufacturer: 'Test',
          model: 'Model',
          category: 'Lift',
          acquisitionCost: '12345',
          tax: { mode: 'EXCLUSIVE', rate: '0' },
          currency: 'TRY',
        });
        assert.equal(machine.status, 201);
        const ar = r.body.items.find((r) => r.id === a.role.id);
        const changed = await call(a.user, `roles/${ar.id}`, 'PATCH', {
          version: ar.updatedAt,
          permissions: tenantPermissions.filter(
            (k) => !k.startsWith('finance.acquisition_cost.'),
          ),
        });
        assert.equal(changed.status, 200);
        const result = await call(a.user, `machines/${machine.body.id}`);
        assert.equal(result.status, 200);
        assert.equal(result.body.acquisitionCost, undefined);
        assert.ok(!JSON.stringify(result.body).includes('12345'));
        assert.equal(
          (
            await call(a.user, 'settings', 'PATCH', {
              name: 'Unknown field',
              version: '2020-01-01T00:00:00Z',
              platformAccess: true,
            })
          ).status,
          400,
        );
        const p = await db.platformRole.create({
          data: {
            name: randomUUID(),
            permissions: {
              create: { permissionKey: 'platform.organization.create' },
            },
          },
        });
        await db.platformAccess.create({
          data: {
            userId: other.user.id,
            active: true,
            roles: { create: { roleId: p.id } },
          },
        });
        assert.equal((await call(other.user, 'settings')).status, 403);
      } finally {
        await app.close();
      }
    },
  );
}
