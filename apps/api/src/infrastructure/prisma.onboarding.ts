import type { Prisma, PrismaClient } from '@rental/database';
import { tenantPermissions } from '@rental/permissions';
import { identifierSchema } from '@rental/validation';
import { AccessError } from '../access/contracts.js';
import type { AccessRepository } from '../access/contracts.js';
import { OnboardingUnitOfWork } from '../onboarding/contracts.js';
import type {
  Invitation,
  InvitationInput,
  OnboardingAction,
  OnboardingRepository,
  OrganizationInput,
} from '../onboarding/contracts.js';
import { PrismaAccessRepository } from './prisma.repositories.js';

export class PrismaOnboardingRepository implements OnboardingRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}
  async hasMemberships(organizationId: string) {
    return (await this.db.membership.count({ where: { organizationId } })) > 0;
  }
  async createOrganization(input: OrganizationInput) {
    return (await this.db.organization.create({ data: input })).id;
  }
  async createAdministratorTemplate(organizationId: string) {
    return (
      await this.db.role.create({
        data: {
          organizationId,
          name: 'Tenant administrator',
          templateKey: 'TENANT_ADMINISTRATION',
          permissions: {
            create: tenantPermissions.map((permissionKey) => ({
              permissionKey,
            })),
          },
        },
      })
    ).id;
  }
  async eligibleGrants(organizationId: string, input: InvitationInput) {
    if (
      !(await this.db.organization.findFirst({
        where: { id: organizationId, status: 'ACTIVE' },
      }))
    )
      return null;
    const roles = await this.db.role.findMany({
      where: { organizationId, id: { in: input.roleIds }, enabled: true },
      include: { permissions: true },
    });
    const branches = await this.db.branch.count({
      where: { organizationId, id: { in: input.branchIds }, active: true },
    });
    if (
      !input.roleIds.length ||
      roles.length !== input.roleIds.length ||
      branches !== input.branchIds.length ||
      (input.branchScope === 'ALL_BRANCHES' && input.branchIds.length > 0) ||
      roles.some((role) =>
        role.permissions.some(
          (grant) =>
            grant.permissionScope !== 'TENANT' ||
            grant.permissionKey.startsWith('platform.'),
        ),
      )
    )
      return null;
    return roles.flatMap((role) =>
      role.permissions.map((grant) => grant.permissionKey),
    );
  }
  async createInvitation(
    organizationId: string,
    invitedById: string,
    input: InvitationInput,
    tokenHash: string,
    expiresAt: Date,
  ) {
    const row = await this.db.organizationInvitation.create({
      data: {
        organizationId,
        invitedById,
        email: input.email,
        branchScope: input.branchScope,
        tokenHash,
        expiresAt,
      },
    });
    await this.db.invitationRole.createMany({
      data: input.roleIds.map((roleId) => ({
        organizationId,
        invitationId: row.id,
        roleId,
      })),
    });
    if (input.branchIds.length)
      await this.db.invitationBranch.createMany({
        data: input.branchIds.map((branchId) => ({
          organizationId,
          invitationId: row.id,
          branchId,
        })),
      });
    return row.id;
  }
  async findInvitation(tokenHash: string): Promise<Invitation | null> {
    const row = await this.db.organizationInvitation.findUnique({
      where: { tokenHash },
      include: { roles: true, branches: true },
    });
    return row
      ? {
          id: row.id,
          organizationId: row.organizationId,
          email: row.email,
          status: row.status,
          expiresAt: row.expiresAt,
          branchScope: row.branchScope,
          roleIds: row.roles.map((role) => role.roleId),
          branchIds: row.branches.map((branch) => branch.branchId),
        }
      : null;
  }
  async revokeInvitation(organizationId: string, id: string) {
    return (
      (
        await this.db.organizationInvitation.updateMany({
          where: { organizationId, id, status: 'PENDING' },
          data: { status: 'REVOKED' },
        })
      ).count === 1
    );
  }
  async resolveUser(issuer: string, subject: string) {
    return (
      (
        await this.db.externalIdentity.findUnique({
          where: { issuer_subject: { issuer, subject } },
          select: { user: { select: { id: true, status: true } } },
        })
      )?.user ?? null
    );
  }
  async emailExists(email: string) {
    return !!(await this.db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    }));
  }
  async createUser(
    name: string,
    email: string,
    issuer: string,
    subject: string,
  ) {
    return (
      await this.db.user.create({
        data: { name, email, identities: { create: { issuer, subject } } },
      })
    ).id;
  }
  async createMembership(userId: string, invitation: Invitation) {
    const organizationId = invitation.organizationId;
    // Acceptance never overwrites an existing membership, roles or branch restrictions.
    if (
      await this.db.membership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      })
    )
      throw new AccessError('ACCESS_DENIED');
    const row = await this.db.membership.create({
      data: {
        userId,
        organizationId,
        status: 'ACTIVE',
        joinedAt: new Date(),
        branchScope: invitation.branchScope,
      },
    });
    await this.db.membershipRole.createMany({
      data: invitation.roleIds.map((roleId) => ({
        organizationId,
        membershipId: row.id,
        roleId,
      })),
    });
    if (invitation.branchIds.length)
      await this.db.membershipBranch.createMany({
        data: invitation.branchIds.map((branchId) => ({
          organizationId,
          membershipId: row.id,
          branchId,
        })),
      });
    return row.id;
  }
  async consumeInvitation(invitation: Invitation, userId: string) {
    return (
      (
        await this.db.organizationInvitation.updateMany({
          where: {
            id: invitation.id,
            organizationId: invitation.organizationId,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
          data: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
            acceptedById: userId,
          },
        })
      ).count === 1
    );
  }
  async audit(
    organizationId: string,
    actorUserId: string,
    action: OnboardingAction,
    targetType: string,
    targetId: string,
    requestId: string,
  ) {
    identifierSchema.parse(requestId);
    await this.db.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        actorType: 'USER',
        action,
        targetType,
        targetId,
        requestId,
        result: 'SUCCESS',
        source: 'api',
        metadata: {},
      },
    });
  }
}

export class PrismaOnboardingUnitOfWork extends OnboardingUnitOfWork {
  constructor(private readonly db: PrismaClient) {
    super();
  }
  override async run<T>(
    work: (
      repository: OnboardingRepository,
      access: AccessRepository,
    ) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) =>
        work(
          new PrismaOnboardingRepository(tx),
          new PrismaAccessRepository(tx),
        ),
      { isolationLevel: 'Serializable' },
    );
  }
}
