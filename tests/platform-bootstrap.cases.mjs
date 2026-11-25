import assert from 'node:assert/strict';
import { bootstrapPlatformOperator } from '../apps/api/dist/infrastructure/prisma.platform-bootstrap.js';

export async function platformBootstrapCases(suite, db) {
  const identity = {
    issuer: 'https://bootstrap.example.test/',
    subject: 'verified-operator',
    email: 'operator@example.test',
    name: 'Operator',
  };
  const verifier = { verifyInvitationIdentity: async () => ({ ...identity }) };
  const run = (
    database = db,
    boundary = verifier,
    subject = identity.subject,
  ) =>
    bootstrapPlatformOperator(
      database,
      boundary,
      'local-test-credential',
      subject,
    );
  await suite.test(
    'platform bootstrap rejects unverified identity and wrong expected subject',
    async () => {
      await assert.rejects(
        run(db, { verifyInvitationIdentity: async () => null }),
      );
      await assert.rejects(run(db, verifier, 'another-operator'));
      assert.equal(await db.platformAccess.count(), 0);
      assert.equal(await db.user.count(), 0);
    },
  );
  await suite.test(
    'platform bootstrap never links by email and rejects disabled identities',
    async () => {
      const user = await db.user.create({
        data: { name: 'Existing', email: identity.email },
      });
      await assert.rejects(run());
      assert.equal(await db.externalIdentity.count(), 0);
      await db.externalIdentity.create({
        data: {
          userId: user.id,
          issuer: identity.issuer,
          subject: identity.subject,
        },
      });
      await db.user.update({
        where: { id: user.id },
        data: { status: 'DISABLED' },
      });
      await assert.rejects(run());
      assert.equal(await db.platformAccess.count(), 0);
      // Test-only unprivileged fixture cleanup, before any immutable audit exists.
      await db.externalIdentity.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    },
  );
  await suite.test(
    'platform bootstrap rolls back identity and grant when audit fails',
    async () => {
      const failingAudit = {
        $transaction: (work, options) =>
          db.$transaction(
            (tx) =>
              work(
                new Proxy(tx, {
                  get(target, property) {
                    if (property === 'auditEvent')
                      return {
                        count: target.auditEvent.count.bind(target.auditEvent),
                        createMany: async () => {
                          throw new Error('Test audit failure');
                        },
                      };
                    const value = Reflect.get(target, property);
                    return typeof value === 'function'
                      ? value.bind(target)
                      : value;
                  },
                }),
              ),
            options,
          ),
      };
      await assert.rejects(run(failingAudit));
      assert.equal(await db.user.count(), 0);
      assert.equal(await db.externalIdentity.count(), 0);
      assert.equal(await db.platformAccess.count(), 0);
      assert.equal(await db.platformRole.count(), 0);
    },
  );
  await suite.test(
    'concurrent bootstrap grants exactly one minimal platform access, no tenant membership, with audit',
    async () => {
      const results = await Promise.allSettled([run(), run()]);
      assert.equal(
        results.filter((result) => result.status === 'fulfilled').length,
        1,
      );
      assert.equal(await db.platformAccess.count(), 1);
      assert.equal(await db.membership.count(), 0);
      assert.equal(await db.organization.count(), 0);
      const access = await db.platformAccess.findFirst({
        include: {
          roles: { include: { role: { include: { permissions: true } } } },
        },
      });
      assert.deepEqual(
        access.roles.flatMap(({ role }) =>
          role.permissions.map(({ permissionKey }) => permissionKey),
        ),
        ['platform.organization.create'],
      );
      const audits = await db.auditEvent.findMany({
        where: { source: 'platform-bootstrap-cli' },
      });
      assert.deepEqual(audits.map(({ action }) => action).sort(), [
        'IDENTITY_LINKED',
        'PLATFORM_OPERATOR_BOOTSTRAPPED',
      ]);
      for (const event of audits) {
        assert.equal(event.actorUserId, access.userId);
        assert.equal(event.organizationId, null);
        assert.ok(!JSON.stringify(event).includes('local-test-credential'));
      }
      await db.platformAccess.update({
        where: { id: access.id },
        data: { active: false },
      });
      await assert.rejects(run());
      assert.equal(await db.platformAccess.count(), 1);
    },
  );
}
