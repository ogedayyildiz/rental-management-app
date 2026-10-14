import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  OnboardingService,
  invitationHash,
} from '../apps/api/dist/onboarding/onboarding.service.js';
import { PrismaOnboardingUnitOfWork } from '../apps/api/dist/infrastructure/prisma.onboarding.js';

export async function onboardingCases(suite, db, fixture) {
  const identity = {
    issuer: 'https://identity.example.test',
    subject: '',
    email: '',
    name: 'Invitee',
  };
  const service = new OnboardingService(new PrismaOnboardingUnitOfWork(db), {
    verifyInvitationIdentity: async (credential) =>
      credential === 'verified' ? { ...identity } : null,
  });
  const platform = await fixture();
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
      userId: platform.user.id,
      active: true,
      roles: { create: { roleId: platformRole.id } },
    },
  });
  async function organization() {
    identity.subject = randomUUID();
    identity.email = `${randomUUID()}@example.test`;
    return service.createOrganization(
      platform.principal,
      {
        name: 'Onboarding',
        defaultCurrency: 'TRY',
        defaultLanguage: 'en',
        timezone: 'Europe/Istanbul',
        email: identity.email,
      },
      randomUUID(),
    );
  }
  const accept = (invitation) =>
    service.accept(
      'Bearer verified',
      { token: invitation.token },
      randomUUID(),
    );

  await suite.test(
    'organization onboarding creates identity, membership, role assignment and audit atomically; replay fails',
    async () => {
      const invitation = await organization();
      const stored = await db.organizationInvitation.findUnique({
        where: { id: invitation.invitationId },
      });
      assert.equal(stored.tokenHash, invitationHash(invitation.token));
      assert.notEqual(stored.tokenHash, invitation.token);
      const result = await accept(invitation);
      const membership = await db.membership.findUnique({
        where: { id: result.membershipId },
        include: { roles: true },
      });
      assert.equal(membership.status, 'ACTIVE');
      assert.equal(membership.branchScope, 'ALL_BRANCHES');
      assert.equal(membership.roles.length, 1);
      assert.equal(
        (
          await db.externalIdentity.findUnique({
            where: {
              issuer_subject: {
                issuer: identity.issuer,
                subject: identity.subject,
              },
            },
          })
        ).userId,
        result.userId,
      );
      assert.equal(
        await db.platformAccess.count({ where: { userId: result.userId } }),
        0,
      );
      const events = await db.auditEvent.findMany({
        where: { organizationId: invitation.organizationId },
      });
      assert.deepEqual(
        new Set(events.map((event) => event.action)),
        new Set([
          'ORGANIZATION_CREATED',
          'INVITATION_CREATED',
          'IDENTITY_LINKED',
          'MEMBERSHIP_CREATED',
          'ROLE_ASSIGNED',
          'INVITATION_ACCEPTED',
        ]),
      );
      assert.ok(!JSON.stringify(events).includes(invitation.token));
      await assert.rejects(accept(invitation), { code: 'ACCESS_DENIED' });
    },
  );
  for (const [name, mutate] of [
    [
      'expired',
      (i) =>
        db.organizationInvitation.update({
          where: { id: i.invitationId },
          data: { createdAt: new Date(0), expiresAt: new Date(1) },
        }),
    ],
    [
      'revoked',
      (i) =>
        db.organizationInvitation.update({
          where: { id: i.invitationId },
          data: { status: 'REVOKED' },
        }),
    ],
    [
      'suspended organization',
      (i) =>
        db.organization.update({
          where: { id: i.organizationId },
          data: { status: 'SUSPENDED' },
        }),
    ],
    [
      'disabled role',
      (i) =>
        db.role.updateMany({
          where: { organizationId: i.organizationId },
          data: { enabled: false },
        }),
    ],
    [
      'wrong verified email',
      async () => {
        identity.email = 'wrong@example.test';
      },
    ],
  ])
    await suite.test(`invitation rejects ${name}`, async () => {
      const invitation = await organization();
      await mutate(invitation);
      await assert.rejects(accept(invitation), { code: 'ACCESS_DENIED' });
      assert.equal(
        await db.membership.count({
          where: { organizationId: invitation.organizationId },
        }),
        0,
      );
    });
  await suite.test(
    'unrecognized identity cannot link by matching email',
    async () => {
      const invitation = await organization();
      const existing = await db.user.create({
        data: { name: 'Existing', email: identity.email },
      });
      await assert.rejects(accept(invitation), { code: 'ACCESS_DENIED' });
      assert.equal(
        await db.externalIdentity.count({ where: { userId: existing.id } }),
        0,
      );
    },
  );
  await suite.test(
    'existing issuer/subject reuses global User across organizations',
    async () => {
      const existing = await fixture();
      const invitation = await organization();
      identity.subject = existing.user.id;
      identity.email = existing.user.email;
      await db.organizationInvitation.update({
        where: { id: invitation.invitationId },
        data: { email: identity.email },
      });
      assert.equal((await accept(invitation)).userId, existing.user.id);
    },
  );
  await suite.test('concurrent acceptance commits only once', async () => {
    const invitation = await organization();
    const results = await Promise.allSettled([
      accept(invitation),
      accept(invitation),
    ]);
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      await db.membership.count({
        where: { organizationId: invitation.organizationId },
      }),
      1,
    );
  });
  await suite.test(
    'audit failure rolls back identity, membership and token consumption',
    async () => {
      const invitation = await organization();
      const failure = new OnboardingService(
        {
          run: (work) =>
            new PrismaOnboardingUnitOfWork(db).run((repository, access) => {
              repository.audit = async () => {
                throw new Error('audit unavailable');
              };
              return work(repository, access);
            }),
        },
        { verifyInvitationIdentity: async () => ({ ...identity }) },
      );
      await assert.rejects(
        failure.accept(
          'Bearer verified',
          { token: invitation.token },
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(
        await db.externalIdentity.count({
          where: { subject: identity.subject },
        }),
        0,
      );
      assert.equal(
        (
          await db.organizationInvitation.findUnique({
            where: { id: invitation.invitationId },
          })
        ).status,
        'PENDING',
      );
    },
  );
  await suite.test(
    'tenant invitation boundaries, revocation and disabled branch revalidation',
    async () => {
      const invitation = await organization();
      const joined = await accept(invitation);
      const user = await db.user.findUnique({ where: { id: joined.userId } });
      // Test verifier uses user ID subjects; authenticate this identity through its own verifier.
      const { AuthenticationService } =
        await import('../apps/api/dist/access/access.service.js');
      const { PrismaAccessRepository } =
        await import('../apps/api/dist/infrastructure/prisma.repositories.js');
      const principal = await new AuthenticationService(
        {
          verify: async () => ({
            issuer: identity.issuer,
            subject: identity.subject,
          }),
        },
        new PrismaAccessRepository(db),
      ).authenticate('Bearer verified');
      const other = await fixture();
      const role = await db.role.findFirst({
        where: { organizationId: invitation.organizationId },
      });
      const branch = await db.branch.create({
        data: { organizationId: invitation.organizationId, name: 'Branch' },
      });
      const input = {
        email: 'next@example.test',
        roleIds: [role.id],
        branchScope: 'SELECTED_BRANCHES',
        branchIds: [branch.id],
      };
      await assert.rejects(
        service.invite(
          principal,
          invitation.organizationId,
          { ...input, roleIds: [other.role.id] },
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(
        service.invite(
          principal,
          invitation.organizationId,
          { ...input, branchIds: [other.branch.id] },
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(
        service.createOrganization(
          principal,
          {
            name: 'Denied',
            defaultCurrency: 'TRY',
            defaultLanguage: 'en',
            timezone: 'UTC',
            email: input.email,
          },
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(
        service.invite(
          platform.principal,
          invitation.organizationId,
          input,
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
      const revoked = await service.invite(
        principal,
        invitation.organizationId,
        input,
        randomUUID(),
      );
      await service.revoke(
        principal,
        invitation.organizationId,
        revoked.invitationId,
        randomUUID(),
      );
      assert.equal(
        await db.auditEvent.count({
          where: {
            targetId: revoked.invitationId,
            action: 'INVITATION_REVOKED',
          },
        }),
        1,
      );
      const lowRole = await db.role.create({
        data: {
          organizationId: invitation.organizationId,
          name: 'No administration',
        },
      });
      const replacement = await service.invite(
        principal,
        invitation.organizationId,
        { ...input, email: user.email, roleIds: [lowRole.id] },
        randomUUID(),
      );
      await assert.rejects(accept(replacement), { code: 'ACCESS_DENIED' });
      const preserved = await db.membershipRole.findMany({
        where: { membershipId: joined.membershipId },
      });
      assert.deepEqual(
        preserved.map((assignment) => assignment.roleId),
        [role.id],
      );
      await assert.rejects(
        service.revokeInitial(
          platform.principal,
          invitation.organizationId,
          replacement.invitationId,
          randomUUID(),
        ),
        { code: 'ACCESS_DENIED' },
      );
      const pending = await service.invite(
        principal,
        invitation.organizationId,
        input,
        randomUUID(),
      );
      identity.subject = randomUUID();
      identity.email = input.email;
      await db.branch.update({
        where: { id: branch.id },
        data: { active: false },
      });
      await assert.rejects(accept(pending), { code: 'ACCESS_DENIED' });
      assert.ok(user.id);
    },
  );
  await suite.test(
    'platform can revoke initial invitation only before membership exists',
    async () => {
      const invitation = await organization();
      await service.revokeInitial(
        platform.principal,
        invitation.organizationId,
        invitation.invitationId,
        randomUUID(),
      );
      await assert.rejects(accept(invitation), { code: 'ACCESS_DENIED' });
      assert.equal(
        await db.auditEvent.count({
          where: {
            targetId: invitation.invitationId,
            action: 'INVITATION_REVOKED',
          },
        }),
        1,
      );
    },
  );
}
