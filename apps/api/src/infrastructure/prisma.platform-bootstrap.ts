import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@rental/database';
import {
  externalIdentitySchema,
  invitationEmailSchema,
} from '@rental/validation';
import type { InvitationIdentityVerifier } from '../access/contracts.js';
import { AccessError } from '../access/contracts.js';

// Administrative CLI only: never register this operation in an HTTP controller.
export async function bootstrapPlatformOperator(
  database: PrismaClient,
  verifier: InvitationIdentityVerifier,
  credential: string,
  expectedSubject: string,
): Promise<{ userId: string; accessId: string }> {
  const identity = await verifier.verifyInvitationIdentity(credential);
  if (
    !identity ||
    identity.subject !== expectedSubject ||
    !externalIdentitySchema.safeParse({
      issuer: identity.issuer,
      subject: identity.subject,
    }).success
  )
    throw new AccessError('UNAUTHENTICATED');
  const email = invitationEmailSchema.safeParse(identity.email);
  if (!email.success || !identity.name.trim() || identity.name.length > 200)
    throw new AccessError('INVALID_INPUT');

  return database.$transaction(
    async (tx) => {
      // Every bootstrap competes for the same lock. Serializable isolation also
      // protects against concurrent identity creation by invitation acceptance.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(742013011)`;
      if (
        (await tx.platformAccess.count()) ||
        (await tx.auditEvent.count({
          where: { action: 'PLATFORM_OPERATOR_BOOTSTRAPPED' },
        }))
      )
        throw new AccessError('ACCESS_DENIED');
      const permissionKey = 'platform.organization.create';
      const permission = await tx.permission.findUnique({
        where: { key: permissionKey },
      });
      if (permission?.scope !== 'PLATFORM')
        throw new AccessError('ACCESS_DENIED');
      const existing = await tx.externalIdentity.findUnique({
        where: {
          issuer_subject: {
            issuer: identity.issuer,
            subject: identity.subject,
          },
        },
        include: { user: true },
      });
      if (existing && existing.user.status !== 'ACTIVE')
        throw new AccessError('ACCESS_DENIED');
      if (
        !existing &&
        (await tx.user.count({
          where: { email: { equals: email.data, mode: 'insensitive' } },
        }))
      )
        throw new AccessError('ACCESS_DENIED');
      const user =
        existing?.user ??
        (await tx.user.create({
          data: {
            name: identity.name,
            email: email.data,
            identities: {
              create: { issuer: identity.issuer, subject: identity.subject },
            },
          },
        }));
      const role = await tx.platformRole.create({
        data: {
          name: 'Initial platform operator',
          permissions: { create: { permissionKey } },
        },
      });
      const access = await tx.platformAccess.create({
        data: {
          userId: user.id,
          active: true,
          roles: { create: { roleId: role.id } },
        },
      });
      const requestId = randomUUID();
      await tx.auditEvent.createMany({
        data: [
          ...(existing
            ? []
            : [
                {
                  actorType: 'USER' as const,
                  actorUserId: user.id,
                  action: 'IDENTITY_LINKED',
                  targetType: 'User',
                  targetId: user.id,
                  result: 'SUCCESS' as const,
                  source: 'platform-bootstrap-cli',
                  requestId,
                  metadata: {},
                },
              ]),
          {
            actorType: 'USER',
            actorUserId: user.id,
            action: 'PLATFORM_OPERATOR_BOOTSTRAPPED',
            targetType: 'PlatformAccess',
            targetId: access.id,
            result: 'SUCCESS',
            source: 'platform-bootstrap-cli',
            requestId,
            metadata: { permission: permissionKey },
          },
        ],
      });
      return { userId: user.id, accessId: access.id };
    },
    { isolationLevel: 'Serializable' },
  );
}
