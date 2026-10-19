import { machineCases } from './machines.cases.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { onboardingCases } from './onboarding.cases.mjs';
import { customerCases } from './customers.cases.mjs';
import { platformBootstrapCases } from './platform-bootstrap.cases.mjs';
import { createDatabase } from '../packages/database/dist/index.js';
import {
  tenantPermissions,
  platformPermissions,
  hasPermission,
} from '../packages/permissions/dist/index.js';
import { auditMetadataSchema } from '../packages/validation/dist/index.js';
import {
  AuthenticationService,
  AccessService,
  requirePermission,
} from '../apps/api/dist/access/access.service.js';
import { IdentityVerifier } from '../apps/api/dist/access/contracts.js';
import {
  PrismaAccessRepository,
  PrismaBranchRepository,
  PrismaFoundationUnitOfWork,
} from '../apps/api/dist/infrastructure/prisma.repositories.js';
import { BranchService } from '../apps/api/dist/branches/branch.service.js';
import {
  FoundationModule,
  DATABASE,
} from '../apps/api/dist/foundation.module.js';

const apiRequire = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const databaseRequire = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);
const { Test } = apiRequire('@nestjs/testing');
const execute = promisify(execFile);
const issuer = 'https://identity.example.test';

// This verifier exists only in tests and is injected by Nest's testing module.
class TestVerifier extends IdentityVerifier {
  async verify(token) {
    return token.startsWith('test-')
      ? { issuer, subject: token.slice(5) }
      : null;
  }
}

test(
  'database, tenant, authorization and audit foundation',
  { timeout: 120000 },
  async (suite) => {
    assert.ok(
      process.env.DATABASE_URL,
      'Start local infrastructure and configure DATABASE_URL',
    );
    const localUrl = new URL(process.env.DATABASE_URL);
    assert.ok(
      ['127.0.0.1', 'localhost', '[::1]'].includes(localUrl.hostname),
      'Tests require a local PostgreSQL instance',
    );
    const databaseName = `rental_test_${randomUUID().replaceAll('-', '')}`;
    const admin = createDatabase(localUrl.href);
    let db;
    let app;
    let created = false;
    try {
      // The identifier is generated internally; no existing database is reset or truncated.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
      created = true;
      localUrl.pathname = `/${databaseName}`;
      await execute(
        process.execPath,
        [databaseRequire.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
        {
          cwd: fileURLToPath(new URL('../packages/database/', import.meta.url)),
          env: { ...process.env, DATABASE_URL: localUrl.href },
          windowsHide: true,
        },
      );
      db = createDatabase(localUrl.href);
      for (const [scope, keys] of [
        ['TENANT', tenantPermissions],
        ['PLATFORM', platformPermissions],
      ]) {
        for (const key of keys)
          await db.permission.upsert({
            where: { key },
            create: { key, scope },
            update: {},
          });
      }
      await platformBootstrapCases(suite, db);
      const repository = new PrismaAccessRepository(db);
      const authentication = new AuthenticationService(
        new TestVerifier(),
        repository,
      );
      const access = new AccessService(repository);
      const branches = new BranchService(new PrismaFoundationUnitOfWork(db));
      const authenticate = (user) =>
        authentication.authenticate(`Bearer test-${user.id}`);

      async function fixture() {
        const organization = await db.organization.create({
          data: {
            name: 'Test organization',
            defaultCurrency: 'TRY',
            defaultLanguage: 'en',
            timezone: 'Europe/Istanbul',
          },
        });
        const user = await db.user.create({
          data: { name: 'Test user', email: `${randomUUID()}@example.test` },
        });
        await db.externalIdentity.create({
          data: { userId: user.id, issuer, subject: user.id },
        });
        const membership = await db.membership.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            status: 'ACTIVE',
            branchScope: 'ALL_BRANCHES',
            joinedAt: new Date(),
          },
        });
        const role = await db.role.create({
          data: {
            organizationId: organization.id,
            name: 'Arbitrary custom role',
            permissions: { create: { permissionKey: 'branches.manage' } },
          },
        });
        await db.membershipRole.create({
          data: {
            organizationId: organization.id,
            membershipId: membership.id,
            roleId: role.id,
          },
        });
        const branch = await db.branch.create({
          data: { organizationId: organization.id, name: 'Original branch' },
        });
        return {
          organization,
          user,
          membership,
          role,
          branch,
          principal: await authenticate(user),
        };
      }

      await suite.test(
        'tenant isolation rejects organization and resource ID substitution, including writes',
        async () => {
          const a = await fixture();
          const b = await fixture();
          assert.equal(
            (await branches.find(a.principal, a.organization.id, a.branch.id))
              .id,
            a.branch.id,
          );
          await assert.rejects(
            branches.find(a.principal, b.organization.id, b.branch.id),
            { code: 'ACCESS_DENIED' },
          );
          await assert.rejects(
            branches.find(a.principal, a.organization.id, b.branch.id),
            { code: 'NOT_FOUND' },
          );
          await assert.rejects(
            branches.rename(
              a.principal,
              a.organization.id,
              b.branch.id,
              { name: 'stolen' },
              randomUUID(),
            ),
            { code: 'NOT_FOUND' },
          );
          assert.equal(
            (await db.branch.findUniqueOrThrow({ where: { id: b.branch.id } }))
              .name,
            'Original branch',
          );
          const context = await access.tenant(a.principal, a.organization.id);
          assert.equal(
            await new PrismaBranchRepository(db).find(context, b.branch.id),
            null,
          );
          await assert.rejects(
            branches.find(
              { userId: a.user.id },
              a.organization.id,
              a.branch.id,
            ),
            { code: 'UNAUTHENTICATED' },
          );
          assert.throws(
            () =>
              new PrismaBranchRepository(db).find(
                { ...context, organizationId: b.organization.id },
                b.branch.id,
              ),
            { code: 'ACCESS_DENIED' },
          );
        },
      );

      await suite.test(
        'inactive membership, suspended organization and disabled user fail closed',
        async () => {
          const a = await fixture();
          await db.membership.update({
            where: { id: a.membership.id },
            data: { status: 'INACTIVE' },
          });
          await assert.rejects(access.tenant(a.principal, a.organization.id), {
            code: 'ACCESS_DENIED',
          });
          await db.membership.update({
            where: { id: a.membership.id },
            data: { status: 'ACTIVE' },
          });
          await db.organization.update({
            where: { id: a.organization.id },
            data: { status: 'SUSPENDED' },
          });
          await assert.rejects(access.tenant(a.principal, a.organization.id), {
            code: 'ACCESS_DENIED',
          });
          await db.organization.update({
            where: { id: a.organization.id },
            data: { status: 'ACTIVE' },
          });
          await db.user.update({
            where: { id: a.user.id },
            data: { status: 'DISABLED' },
          });
          await assert.rejects(authenticate(a.user), {
            code: 'UNAUTHENTICATED',
          });
          await assert.rejects(access.tenant(a.principal, a.organization.id), {
            code: 'ACCESS_DENIED',
          });
        },
      );

      await suite.test(
        'permissions depend on grants, not names, and refresh on subsequent operations',
        async () => {
          const a = await fixture();
          await db.role.update({
            where: { id: a.role.id },
            data: { name: 'Renamed role' },
          });
          await branches.find(a.principal, a.organization.id, a.branch.id);
          await db.rolePermission.deleteMany({
            where: { organizationId: a.organization.id },
          });
          await db.role.update({
            where: { id: a.role.id },
            data: { name: 'General Manager' },
          });
          await assert.rejects(
            branches.find(a.principal, a.organization.id, a.branch.id),
            { code: 'ACCESS_DENIED' },
          );
          await db.rolePermission.create({
            data: {
              organizationId: a.organization.id,
              roleId: a.role.id,
              permissionKey: 'branches.manage',
            },
          });
          await db.role.update({
            where: { id: a.role.id },
            data: { enabled: false },
          });
          await assert.rejects(
            branches.find(a.principal, a.organization.id, a.branch.id),
            { code: 'ACCESS_DENIED' },
          );
          assert.equal(hasPermission(['branches.*'], 'branches.manage'), false);
        },
      );

      await suite.test(
        'organization switching recomputes membership permissions without combining grants',
        async () => {
          const a = await fixture();
          const b = await fixture();
          await db.membership.create({
            data: {
              userId: a.user.id,
              organizationId: b.organization.id,
              status: 'ACTIVE',
              branchScope: 'ALL_BRANCHES',
            },
          });
          assert.equal(
            (await access.tenant(a.principal, b.organization.id)).permissions
              .length,
            0,
          );
          await assert.rejects(
            branches.find(a.principal, b.organization.id, b.branch.id),
            { code: 'ACCESS_DENIED' },
          );
          await branches.find(a.principal, a.organization.id, a.branch.id);
        },
      );

      await suite.test(
        'branch restriction filters both reads and writes, including an empty selection',
        async () => {
          const a = await fixture();
          const other = await db.branch.create({
            data: { organizationId: a.organization.id, name: 'Other branch' },
          });
          await db.membership.update({
            where: { id: a.membership.id },
            data: { branchScope: 'SELECTED_BRANCHES' },
          });
          await assert.rejects(
            branches.find(a.principal, a.organization.id, a.branch.id),
            { code: 'NOT_FOUND' },
          );
          await db.membershipBranch.create({
            data: {
              organizationId: a.organization.id,
              membershipId: a.membership.id,
              branchId: a.branch.id,
            },
          });
          await branches.find(a.principal, a.organization.id, a.branch.id);
          await assert.rejects(
            branches.find(a.principal, a.organization.id, other.id),
            { code: 'NOT_FOUND' },
          );
          await assert.rejects(
            branches.rename(
              a.principal,
              a.organization.id,
              other.id,
              { name: 'Forbidden' },
              randomUUID(),
            ),
            { code: 'NOT_FOUND' },
          );
        },
      );

      await suite.test(
        'platform access never grants tenant access, and tenant grants never grant platform access',
        async () => {
          const a = await fixture();
          await assert.rejects(
            access.requirePlatform(a.principal, 'platform.system.read'),
            { code: 'ACCESS_DENIED' },
          );
          const platformRole = await db.platformRole.create({
            data: {
              name: randomUUID(),
              permissions: {
                create: { permissionKey: 'platform.system.read' },
              },
            },
          });
          const platform = await db.platformAccess.create({
            data: {
              userId: a.user.id,
              active: true,
              roles: { create: { roleId: platformRole.id } },
            },
          });
          await access.requirePlatform(a.principal, 'platform.system.read');
          const context = await access.tenant(a.principal, a.organization.id);
          assert.throws(
            () => requirePermission(context, 'platform.system.read'),
            { code: 'ACCESS_DENIED' },
          );
          await db.membership.update({
            where: { id: a.membership.id },
            data: { status: 'INACTIVE' },
          });
          await assert.rejects(access.tenant(a.principal, a.organization.id), {
            code: 'ACCESS_DENIED',
          });
          await access.requirePlatform(a.principal, 'platform.system.read');
          await db.platformAccess.update({
            where: { id: platform.id },
            data: { active: false },
          });
          await assert.rejects(
            access.requirePlatform(a.principal, 'platform.system.read'),
            { code: 'ACCESS_DENIED' },
          );
        },
      );

      await suite.test(
        'database foreign keys reject cross-tenant role, branch and invitation associations',
        async () => {
          const a = await fixture();
          const b = await fixture();
          await assert.rejects(
            db.membershipRole.create({
              data: {
                organizationId: a.organization.id,
                membershipId: a.membership.id,
                roleId: b.role.id,
              },
            }),
          );
          await assert.rejects(
            db.membershipBranch.create({
              data: {
                organizationId: a.organization.id,
                membershipId: a.membership.id,
                branchId: b.branch.id,
              },
            }),
          );
          const invitation = await db.organizationInvitation.create({
            data: {
              organizationId: a.organization.id,
              email: 'invite@example.test',
              invitedById: a.user.id,
              tokenHash: randomUUID().replaceAll('-', '').repeat(2),
              expiresAt: new Date(Date.now() + 60000),
            },
          });
          await assert.rejects(
            db.invitationRole.create({
              data: {
                organizationId: a.organization.id,
                invitationId: invitation.id,
                roleId: b.role.id,
              },
            }),
          );
          await assert.rejects(
            db.invitationBranch.create({
              data: {
                organizationId: a.organization.id,
                invitationId: invitation.id,
                branchId: b.branch.id,
              },
            }),
          );
          await assert.rejects(
            db.rolePermission.create({
              data: {
                organizationId: a.organization.id,
                roleId: a.role.id,
                permissionKey: 'platform.system.read',
                permissionScope: 'PLATFORM',
              },
            }),
          );
          const role = await db.platformRole.create({
            data: { name: randomUUID() },
          });
          await assert.rejects(
            db.platformRolePermission.create({
              data: {
                roleId: role.id,
                permissionKey: 'branches.manage',
                permissionScope: 'TENANT',
              },
            }),
          );
          await assert.rejects(
            db.membership.create({
              data: { userId: a.user.id, organizationId: a.organization.id },
            }),
          );
        },
      );

      await suite.test(
        'external identities use issuer plus subject, allow multiple providers, and never auto-link by email',
        async () => {
          const a = await fixture();
          const b = await fixture();
          await db.externalIdentity.create({
            data: {
              userId: b.user.id,
              issuer: 'https://second.example.test',
              subject: a.user.id,
            },
          });
          await db.externalIdentity.create({
            data: {
              userId: a.user.id,
              issuer: 'https://third.example.test',
              subject: 'another-subject',
            },
          });
          assert.deepEqual(
            await repository.findActiveUser({ issuer, subject: a.user.id }),
            { id: a.user.id },
          );
          assert.deepEqual(
            await repository.findActiveUser({
              issuer: 'https://second.example.test',
              subject: a.user.id,
            }),
            { id: b.user.id },
          );
          assert.equal(
            await repository.findActiveUser({
              issuer: 'https://unknown.example.test',
              subject: a.user.id,
            }),
            null,
          );
          await assert.rejects(
            db.externalIdentity.create({
              data: { userId: b.user.id, issuer, subject: a.user.id },
            }),
          );
          await assert.rejects(
            authentication.authenticate('Bearer unsigned.jwt.value'),
            { code: 'UNAUTHENTICATED' },
          );
        },
      );

      await suite.test(
        'sensitive mutation commits its full audit attribution and rolls back if audit fails',
        async () => {
          const a = await fixture();
          const requestId = randomUUID();
          await branches.rename(
            a.principal,
            a.organization.id,
            a.branch.id,
            { name: 'New name' },
            requestId,
          );
          const event = await db.auditEvent.findFirstOrThrow({
            where: { requestId },
          });
          assert.equal(event.actorUserId, a.user.id);
          assert.equal(event.organizationId, a.organization.id);
          assert.equal(event.action, 'BRANCH_UPDATED');
          assert.equal(event.targetId, a.branch.id);
          assert.equal(event.targetType, 'Branch');
          assert.equal(event.result, 'SUCCESS');
          assert.equal(event.source, 'api');
          assert.ok(event.timestamp instanceof Date);
          assert.deepEqual(event.metadata, {
            before: { name: 'Original branch' },
            after: { name: 'New name' },
          });
          await assert.rejects(
            db.auditEvent.update({
              where: { id: event.id },
              data: { action: 'tampered' },
            }),
          );
          await assert.rejects(
            db.auditEvent.delete({ where: { id: event.id } }),
          );
          await assert.rejects(
            db.$executeRawUnsafe('TRUNCATE TABLE "AuditEvent"'),
          );
          const systemEvent = {
            actorType: 'SYSTEM',
            action: 'TEST_SYSTEM_EVENT',
            targetType: 'System',
            targetId: 'test',
            result: 'SUCCESS',
            source: 'test',
            requestId: randomUUID(),
            metadata: {},
          };
          await assert.rejects(db.auditEvent.create({ data: systemEvent }));
          const systemAudit = await db.auditEvent.create({
            data: { ...systemEvent, systemActor: 'test-runner' },
          });
          assert.equal(systemAudit.organizationId, null);
          assert.equal(systemAudit.actorUserId, null);
          assert.equal(systemAudit.systemActor, 'test-runner');
          assert.equal(
            auditMetadataSchema.safeParse({ authorization: 'secret' }).success,
            false,
          );
          const realUnit = new PrismaFoundationUnitOfWork(db);
          const failingService = new BranchService({
            run: (work) =>
              realUnit.run((repos) =>
                work({
                  ...repos,
                  audit: {
                    append: async () => {
                      throw new Error('Audit unavailable');
                    },
                  },
                }),
              ),
          });
          await assert.rejects(
            failingService.rename(
              a.principal,
              a.organization.id,
              a.branch.id,
              { name: 'Rolled back' },
              randomUUID(),
            ),
            /Audit unavailable/,
          );
          assert.equal(
            (await db.branch.findUniqueOrThrow({ where: { id: a.branch.id } }))
              .name,
            'New name',
          );
          await assert.rejects(
            branches.rename(
              a.principal,
              a.organization.id,
              a.branch.id,
              { name: 'x', organizationId: randomUUID() },
              randomUUID(),
            ),
            { code: 'INVALID_INPUT' },
          );
        },
      );

      await suite.test(
        'real HTTP guard rejects forged identity and tenant scope, validates bodies and enforces permissions',
        async () => {
          const a = await fixture();
          const b = await fixture();
          const module = await Test.createTestingModule({
            imports: [FoundationModule],
          })
            .overrideProvider(DATABASE)
            .useValue(db)
            .overrideProvider(IdentityVerifier)
            .useValue(new TestVerifier())
            .compile();
          app = module.createNestApplication({ logger: false });
          await app.listen(0, '127.0.0.1');
          const base = await app.getUrl();
          const path = `/organizations/${a.organization.id}/branches/${a.branch.id}`;
          const headers = {
            authorization: `Bearer test-${a.user.id}`,
            'content-type': 'application/json',
          };
          async function status(pathname, options = {}) {
            const response = await fetch(base + pathname, options);
            await response.json();
            return response.status;
          }
          assert.equal(
            await status(path, {
              headers: {
                'x-user-id': a.user.id,
                'x-organization-id': a.organization.id,
              },
            }),
            401,
          );
          assert.equal(await status(path, { headers }), 200);
          const me = await fetch(`${base}/me`, { headers });
          assert.equal(me.status, 200);
          const profile = await me.json();
          assert.equal(profile.id, a.user.id);
          assert.equal(
            profile.organizations[0].access.organizationId,
            a.organization.id,
          );
          assert.deepEqual(profile.platformPermissions, []);
          assert.equal(
            await status('/platform/organizations', {
              method: 'POST',
              headers,
              body: JSON.stringify({ name: 'Denied' }),
            }),
            403,
          );
          assert.equal(
            await status('/invitations/accept', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token: 'a'.repeat(43) }),
            }),
            401,
          );
          assert.equal(
            await status(
              `/organizations/${b.organization.id}/branches/${b.branch.id}`,
              { headers },
            ),
            403,
          );
          assert.equal(
            await status(
              `/organizations/${a.organization.id}/branches/${b.branch.id}`,
              { headers },
            ),
            404,
          );
          assert.equal(
            await status(path, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ name: 'HTTP rename' }),
            }),
            200,
          );
          assert.equal(
            await status(path, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ name: '', userId: b.user.id }),
            }),
            400,
          );
          await db.rolePermission.deleteMany({
            where: { organizationId: a.organization.id },
          });
          assert.equal(await status(path, { headers }), 403);
          await app.close();
          app = undefined;
        },
      );

      await suite.test(
        'runtime Auth0 verifier rejects a non-JWT credential',
        async () => {
          process.env.AUTH0_ISSUER = 'https://identity.example.test/';
          process.env.AUTH0_AUDIENCE = 'test-api';
          process.env.AUTH0_ALLOWED_CLIENT_IDS = 'test-web';
          const a = await fixture();
          const module = await Test.createTestingModule({
            imports: [FoundationModule],
          })
            .overrideProvider(DATABASE)
            .useValue(db)
            .compile();
          app = module.createNestApplication({ logger: false });
          await app.listen(0, '127.0.0.1');
          const response = await fetch(
            `${await app.getUrl()}/organizations/${a.organization.id}/branches/${a.branch.id}`,
            { headers: { authorization: `Bearer test-${a.user.id}` } },
          );
          assert.equal(response.status, 401);
          await response.json();
          await app.close();
          app = undefined;
        },
      );
      await machineCases(suite, db, fixture, {
        Test,
        FoundationModule,
        DATABASE,
        IdentityVerifier,
        TestVerifier,
      });
      await onboardingCases(suite, db, fixture);
      await customerCases(suite, db, fixture, {
        Test,
        FoundationModule,
        DATABASE,
        IdentityVerifier,
        TestVerifier,
      });
    } finally {
      if (app) await app.close();
      if (db) await db.$disconnect();
      if (created)
        await admin.$executeRawUnsafe(
          `DROP DATABASE "${databaseName}" WITH (FORCE)`,
        );
      await admin.$disconnect();
    }
  },
);
