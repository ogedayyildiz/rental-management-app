import { Prisma } from '@rental/database';
import type { PrismaClient } from '@rental/database';
import { adminAuditMetadataSchema, identifierSchema } from '@rental/validation';
import type {
  AdminQuery,
  AdminRole,
  AdminMember,
  AdminRoleInput,
  AdminMetadata,
  OrganizationSettings,
} from '@rental/validation';
import { AdministrationUnitOfWork } from '../administration/contracts.js';
import type {
  AdministrationRepository,
  Page,
} from '../administration/contracts.js';
import { assertTenantContext } from '../access/access.service.js';
import type { TenantContext } from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import { PrismaAccessRepository } from './prisma.repositories.js';
const organizationSelect = {
  id: true,
  name: true,
  legalName: true,
  country: true,
  defaultCurrency: true,
  defaultLanguage: true,
  timezone: true,
  updatedAt: true,
} as const;
const memberSelect = {
  id: true,
  userId: true,
  status: true,
  branchScope: true,
  updatedAt: true,
  user: { select: { name: true, email: true, status: true } },
  roles: { select: { roleId: true } },
  branches: { select: { branchId: true } },
} as const;
type MemberRow = Prisma.MembershipGetPayload<{ select: typeof memberSelect }>;
const member = (r: MemberRow): AdminMember => ({
  id: r.id,
  userId: r.userId,
  name: r.user.name,
  email: r.user.email,
  userStatus: r.user.status,
  status: r.status,
  branchScope: r.branchScope,
  roleIds: r.roles.map((x) => x.roleId),
  branchIds: r.branches.map((x) => x.branchId),
  updatedAt: r.updatedAt.toISOString(),
});
const page = <T extends { id: string }>(rows: T[], limit: number): Page<T> => ({
  items: rows.slice(0, limit),
  nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
});
const window = (q: AdminQuery) => ({
  take: q.limit + 1,
  orderBy: { id: 'asc' as const },
});
const cursor = (q: AdminQuery) => (q.cursor ? { id: { gt: q.cursor } } : {});
const orgView = (
  r: Prisma.OrganizationGetPayload<{ select: typeof organizationSelect }>,
): OrganizationSettings => ({
  ...r,
  defaultLanguage: r.defaultLanguage as 'en' | 'tr',
  updatedAt: r.updatedAt.toISOString(),
});
export class PrismaAdministrationRepository implements AdministrationRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}
  async lock(org: string) {
    await this.db
      .$queryRaw`SELECT id FROM "Organization" WHERE id=${org}::uuid FOR UPDATE`;
  }
  private org(c: TenantContext) {
    assertTenantContext(c);
    return c.organizationId;
  }
  async organization(c: TenantContext) {
    const r = await this.db.organization.findUniqueOrThrow({
      where: { id: this.org(c) },
      select: organizationSelect,
    });
    return orgView(r);
  }
  async updateOrganization(
    c: TenantContext,
    input: Partial<Omit<OrganizationSettings, 'id' | 'updatedAt'>>,
    version: string,
  ) {
    const rows = await this.db.organization.updateManyAndReturn({
      where: { id: this.org(c), updatedAt: new Date(version) },
      data: input,
      select: organizationSelect,
    });
    if (!rows[0]) throw new AccessError('CONFLICT');
    return orgView(rows[0]);
  }
  private roleInclude() {
    return {
      permissions: {
        where: { permissionScope: 'TENANT' as const },
        select: { permissionKey: true },
      },
      _count: {
        select: {
          memberships: true,
          invitations: {
            where: {
              invitation: {
                status: 'PENDING' as const,
                expiresAt: { gt: new Date() },
              },
            },
          },
        },
      },
    };
  }
  async roles(c: TenantContext, q: AdminQuery) {
    const rows = await this.db.role.findMany({
      where: {
        organizationId: this.org(c),
        ...cursor(q),
        ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      },
      include: this.roleInclude(),
      ...window(q),
    });
    return page(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled,
        templateKey: r.templateKey,
        updatedAt: r.updatedAt.toISOString(),
        permissions: r.permissions.map((p) => p.permissionKey),
        memberCount: r._count.memberships,
        pendingInvitationCount: r._count.invitations,
      })),
      q.limit,
    );
  }
  async role(c: TenantContext, id: string): Promise<AdminRole | null> {
    const r = await this.db.role.findFirst({
      where: { organizationId: this.org(c), id },
      include: this.roleInclude(),
    });
    return r
      ? {
          id: r.id,
          name: r.name,
          enabled: r.enabled,
          templateKey: r.templateKey,
          updatedAt: r.updatedAt.toISOString(),
          permissions: r.permissions.map((p) => p.permissionKey),
          memberCount: r._count.memberships,
          pendingInvitationCount: r._count.invitations,
        }
      : null;
  }
  async saveRole(
    c: TenantContext,
    input: AdminRoleInput & { enabled: boolean },
    id?: string,
    version?: string,
  ) {
    const organizationId = this.org(c);
    if (id) {
      const r = await this.db.role.updateMany({
        where: { organizationId, id, updatedAt: new Date(version!) },
        data: {
          name: input.name,
          enabled: input.enabled,
          updatedAt: new Date(),
        },
      });
      if (r.count !== 1) throw new AccessError('CONFLICT');
      await this.db.rolePermission.deleteMany({
        where: { organizationId, roleId: id },
      });
    } else {
      id = (
        await this.db.role.create({
          data: { organizationId, name: input.name },
        })
      ).id;
    }
    if (input.permissions.length)
      await this.db.rolePermission.createMany({
        data: input.permissions.map((permissionKey) => ({
          organizationId,
          roleId: id!,
          permissionKey,
          permissionScope: 'TENANT',
        })),
      });
    return (await this.role(c, id))!;
  }
  async members(c: TenantContext, q: AdminQuery) {
    if (q.status && !['ACTIVE', 'INACTIVE'].includes(q.status))
      throw new AccessError('INVALID_INPUT');
    const rows = await this.db.membership.findMany({
      where: {
        organizationId: this.org(c),
        ...cursor(q),
        ...(q.status ? { status: q.status as 'ACTIVE' | 'INACTIVE' } : {}),
        ...(q.roleId ? { roles: { some: { roleId: q.roleId } } } : {}),
        ...(q.branchId
          ? {
              OR: [
                { branchScope: 'ALL_BRANCHES' },
                { branches: { some: { branchId: q.branchId } } },
              ],
            }
          : {}),
        ...(q.q
          ? {
              user: {
                OR: [
                  { name: { contains: q.q, mode: 'insensitive' } },
                  { email: { contains: q.q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      select: memberSelect,
      ...window(q),
    });
    return page(rows.map(member), q.limit);
  }
  async member(c: TenantContext, id: string) {
    const r = await this.db.membership.findFirst({
      where: { organizationId: this.org(c), id },
      select: memberSelect,
    });
    return r ? member(r) : null;
  }
  async saveMember(c: TenantContext, row: AdminMember, version: string) {
    const organizationId = this.org(c),
      membershipId = row.id;
    const r = await this.db.membership.updateMany({
      where: { organizationId, id: row.id, updatedAt: new Date(version) },
      data: {
        status: row.status,
        branchScope: row.branchScope,
        updatedAt: new Date(),
      },
    });
    if (r.count !== 1) throw new AccessError('CONFLICT');
    await this.db.membershipRole.deleteMany({
      where: { organizationId, membershipId },
    });
    await this.db.membershipBranch.deleteMany({
      where: { organizationId, membershipId },
    });
    if (row.roleIds.length)
      await this.db.membershipRole.createMany({
        data: row.roleIds.map((roleId) => ({
          organizationId,
          membershipId,
          roleId,
        })),
      });
    if (row.branchIds.length)
      await this.db.membershipBranch.createMany({
        data: row.branchIds.map((branchId) => ({
          organizationId,
          membershipId,
          branchId,
        })),
      });
    return (await this.member(c, membershipId))!;
  }
  async activeBranches(c: TenantContext, ids: string[]) {
    return (
      (await this.db.branch.count({
        where: { organizationId: this.org(c), id: { in: ids }, active: true },
      })) === ids.length
    );
  }
  async hasAdministrator(c: TenantContext) {
    const rows = await this.db.membership.findMany({
      where: {
        organizationId: this.org(c),
        status: 'ACTIVE',
        branchScope: 'ALL_BRANCHES',
        user: { status: 'ACTIVE' },
      },
      select: {
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
    return rows.some((m) => {
      const keys = new Set(
        m.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionKey)),
      );
      return [
        'organization.manage',
        'users.manage',
        'roles.manage',
        'branches.manage',
      ].every((k) => keys.has(k));
    });
  }
  async branches(c: TenantContext, q: AdminQuery) {
    const rows = await this.db.branch.findMany({
      where: {
        organizationId: this.org(c),
        AND: [
          cursor(q),
          ...(c.branchScope === 'SELECTED_BRANCHES'
            ? [{ id: { in: [...c.branchIds] } }]
            : []),
        ],
        ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        active: true,
        updatedAt: true,
        _count: { select: { memberships: true } },
      },
      ...window(q),
    });
    return page(
      rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        name: r.name,
        active: r.active,
        updatedAt: r.updatedAt.toISOString(),
        memberCount: r._count.memberships,
      })),
      q.limit,
    );
  }
  async createBranch(c: TenantContext, name: string) {
    const r = await this.db.branch.create({
      data: { organizationId: this.org(c), name },
    });
    return {
      id: r.id,
      organizationId: r.organizationId,
      name: r.name,
      active: r.active,
      updatedAt: r.updatedAt.toISOString(),
      memberCount: 0,
    };
  }
  async invitations(c: TenantContext, q: AdminQuery) {
    const now = new Date();
    let status: Prisma.OrganizationInvitationWhereInput = {};
    if (q.status === 'PENDING')
      status = { status: 'PENDING', expiresAt: { gt: now } };
    else if (q.status === 'EXPIRED')
      status = {
        OR: [
          { status: 'EXPIRED' },
          { status: 'PENDING', expiresAt: { lte: now } },
        ],
      };
    else if (q.status === 'REVOKED' || q.status === 'ACCEPTED')
      status = { status: q.status };
    else if (q.status) throw new AccessError('INVALID_INPUT');
    const rows = await this.db.organizationInvitation.findMany({
      where: {
        organizationId: this.org(c),
        ...cursor(q),
        ...status,
        ...(q.q ? { email: { contains: q.q, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        email: true,
        status: true,
        branchScope: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
        roles: { select: { roleId: true } },
        branches: { select: { branchId: true } },
      },
      ...window(q),
    });
    return page(
      rows.map((r) => ({
        id: r.id,
        email: r.email,
        status:
          r.status === 'PENDING' && r.expiresAt <= now
            ? ('EXPIRED' as const)
            : r.status,
        branchScope: r.branchScope,
        roleIds: r.roles.map((x) => x.roleId),
        branchIds: r.branches.map((x) => x.branchId),
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        acceptedAt: r.acceptedAt?.toISOString() ?? null,
      })),
      q.limit,
    );
  }
  async auditEvents(c: TenantContext, q: AdminQuery) {
    const organizationId = this.org(c);
    const domains: Record<NonNullable<AdminQuery['domain']>, string[]> = {
      ADMINISTRATION: [
        'Organization',
        'Membership',
        'Role',
        'Branch',
        'OrganizationInvitation',
        'User',
      ],
      CUSTOMERS: ['Customer', 'CustomerContact', 'CustomerAddress'],
      MACHINES: ['Machine'],
      RENTALS: ['Rental'],
      MAINTENANCE: [
        'WorkOrder',
        'MaintenancePlan',
        'MachineMaintenancePlan',
        'ServiceRestriction',
      ],
      TELEMETRY: ['TrackingDevice', 'DeviceInstallation'],
    };
    const where: Prisma.AuditEventWhereInput = {
      organizationId,
      ...(q.actorId ? { actorUserId: q.actorId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.targetType ? { targetType: q.targetType } : {}),
      ...(q.domain ? { AND: { targetType: { in: domains[q.domain] } } } : {}),
      timestamp: {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lt: new Date(q.to) } : {}),
      },
    };
    if (q.cursor) {
      const anchor = await this.db.auditEvent.findFirst({
        where: { ...where, id: q.cursor },
        select: { id: true, timestamp: true },
      });
      if (!anchor) throw new AccessError('INVALID_INPUT');
      where.OR = [
        { timestamp: { lt: anchor.timestamp } },
        { timestamp: anchor.timestamp, id: { lt: anchor.id } },
      ];
    }
    const rows = await this.db.auditEvent.findMany({
      where,
      take: q.limit + 1,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        actorUserId: true,
        actor: { select: { name: true } },
        actorType: true,
        action: true,
        targetType: true,
        targetId: true,
        timestamp: true,
        result: true,
        metadata: true,
      },
    });
    // Never serialize raw audit metadata. Even a privileged audit reader may lack financial grants.
    return page(
      rows.map((r) => {
        const parsed = adminAuditMetadataSchema.safeParse(r.metadata);
        return {
          id: r.id,
          actorUserId: r.actorUserId,
          actorName: r.actor?.name ?? null,
          actorType: r.actorType,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          timestamp: r.timestamp.toISOString(),
          result: r.result,
          changes: parsed.success ? parsed.data.changes : [],
        };
      }),
      q.limit,
    );
  }
  async audit(
    c: TenantContext,
    requestId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: AdminMetadata,
  ) {
    await this.db.auditEvent.create({
      data: {
        organizationId: this.org(c),
        actorUserId: c.userId,
        actorType: 'USER',
        action,
        targetType,
        targetId,
        requestId: identifierSchema.parse(requestId),
        result: 'SUCCESS',
        source: 'api',
        metadata: adminAuditMetadataSchema.parse(metadata),
      },
    });
  }
}
export class PrismaAdministrationUnitOfWork extends AdministrationUnitOfWork {
  constructor(private readonly db: PrismaClient) {
    super();
  }
  override async run<T>(
    fn: (r: {
      access: PrismaAccessRepository;
      admin: AdministrationRepository;
    }) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        (tx) =>
          fn({
            access: new PrismaAccessRepository(tx),
            admin: new PrismaAdministrationRepository(tx),
          }),
        { isolationLevel: 'Serializable', timeout: 15000 },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(e.code)
      )
        throw new AccessError('CONFLICT');
      throw e;
    }
  }
}
