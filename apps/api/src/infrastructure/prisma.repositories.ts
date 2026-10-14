import { Prisma } from '@rental/database';
import type { PrismaClient } from '@rental/database';
import type {
  AccessRepository,
  ExternalIdentityReference,
  TenantAccessRecord,
} from '../access/contracts.js';
import { assertTenantContext } from '../access/access.service.js';
import type { TenantContext } from '../access/access.service.js';
import type { AuditRecord, AuditRepository } from '../audit/audit.service.js';
import { FoundationUnitOfWork } from '../branches/branch.service.js';
import type {
  BranchRepository,
  BranchView,
  FoundationRepositories,
} from '../branches/branch.service.js';

export class PrismaAccessRepository implements AccessRepository {
  constructor(private readonly database: Prisma.TransactionClient) {}

  async findActiveUser(
    identity: ExternalIdentityReference,
  ): Promise<{ id: string } | null> {
    const row = await this.database.externalIdentity.findFirst({
      where: {
        issuer: identity.issuer,
        subject: identity.subject,
        user: { status: 'ACTIVE' },
      },
      select: { user: { select: { id: true } } },
    });
    return row?.user ?? null;
  }

  async findTenantAccess(
    userId: string,
    organizationId: string,
  ): Promise<TenantAccessRecord | null> {
    const membership = await this.database.membership.findFirst({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
        user: { status: 'ACTIVE' },
        organization: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        branchScope: true,
        branches: { select: { branchId: true } },
        roles: {
          where: { role: { enabled: true } },
          select: {
            role: {
              select: {
                permissions: {
                  where: { permissionScope: 'TENANT' },
                  select: { permissionKey: true },
                },
              },
            },
          },
        },
      },
    });
    if (!membership) return null;
    return {
      membershipId: membership.id,
      userId: membership.userId,
      organizationId: membership.organizationId,
      branchScope: membership.branchScope,
      branchIds: membership.branches.map((item) => item.branchId),
      permissions: [
        ...new Set(
          membership.roles.flatMap((item) =>
            item.role.permissions.map((grant) => grant.permissionKey),
          ),
        ),
      ],
    };
  }

  async findPlatformPermissions(
    userId: string,
  ): Promise<readonly string[] | null> {
    const access = await this.database.platformAccess.findFirst({
      where: { userId, active: true, user: { status: 'ACTIVE' } },
      select: {
        roles: {
          where: { role: { enabled: true } },
          select: {
            role: {
              select: {
                permissions: {
                  where: { permissionScope: 'PLATFORM' },
                  select: { permissionKey: true },
                },
              },
            },
          },
        },
      },
    });
    return access
      ? [
          ...new Set(
            access.roles.flatMap((item) =>
              item.role.permissions.map((grant) => grant.permissionKey),
            ),
          ),
        ]
      : null;
  }
}

const branchSelect = {
  id: true,
  organizationId: true,
  name: true,
  active: true,
} as const;
export class PrismaBranchRepository implements BranchRepository {
  constructor(private readonly database: Prisma.TransactionClient) {}

  private where(context: TenantContext, id: string): Prisma.BranchWhereInput {
    assertTenantContext(context);
    return {
      id,
      organizationId: context.organizationId,
      ...(context.branchScope === 'SELECTED_BRANCHES'
        ? { AND: { id: { in: [...context.branchIds] } } }
        : {}),
    };
  }

  find(context: TenantContext, id: string): Promise<BranchView | null> {
    return this.database.branch.findFirst({
      where: this.where(context, id),
      select: branchSelect,
    });
  }

  async rename(
    context: TenantContext,
    id: string,
    name: string,
  ): Promise<BranchView | null> {
    const rows = await this.database.branch.updateManyAndReturn({
      where: this.where(context, id),
      data: { name },
      select: branchSelect,
    });
    return rows[0] ?? null;
  }
}

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly database: Prisma.TransactionClient) {}
  async append(event: AuditRecord): Promise<void> {
    await this.database.auditEvent.create({ data: event });
  }
}

export class PrismaFoundationUnitOfWork extends FoundationUnitOfWork {
  constructor(private readonly database: PrismaClient) {
    super();
  }
  override run<T>(
    work: (repositories: FoundationRepositories) => Promise<T>,
  ): Promise<T> {
    return this.database.$transaction(
      (tx) =>
        work({
          access: new PrismaAccessRepository(tx),
          branches: new PrismaBranchRepository(tx),
          audit: new PrismaAuditRepository(tx),
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
