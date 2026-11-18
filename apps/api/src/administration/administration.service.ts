import {
  identifierSchema,
  organizationSettingsUpdateSchema,
  adminQuerySchema,
  adminRoleInputSchema,
  adminRoleUpdateSchema,
  adminMemberUpdateSchema,
  adminBranchCreateSchema,
} from '@rental/validation';
import type { AdminMember, AdminRole } from '@rental/validation';
import type { TenantPermission } from '@rental/permissions';
import type { OrganizationSettings } from '@rental/validation';
import { tenantPermissions } from '@rental/permissions';
import { AccessService, requirePermission } from '../access/access.service.js';
import type {
  AuthenticatedPrincipal,
  TenantContext,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type {
  AdministrationUnitOfWork,
  AdministrationRepository,
} from './contracts.js';
const parse = <T>(
  s: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  v: unknown,
): T => {
  const r = s.safeParse(v);
  if (!r.success) throw new AccessError('INVALID_INPUT');
  return r.data;
};
export class AdministrationService {
  constructor(private readonly uow: AdministrationUnitOfWork) {}
  private run<T>(
    p: AuthenticatedPrincipal,
    o: unknown,
    permission: TenantPermission,
    work: (r: AdministrationRepository, c: TenantContext) => Promise<T>,
    all = true,
  ) {
    const org = parse(identifierSchema, o);
    return this.uow.run(async ({ access, admin }) => {
      await admin.lock(org);
      const c = await new AccessService(access).tenant(p, org);
      requirePermission(c, permission);
      if (all && c.branchScope !== 'ALL_BRANCHES')
        throw new AccessError('ACCESS_DENIED');
      return work(admin, c);
    });
  }
  private ceiling(c: TenantContext, keys: readonly string[]) {
    if (
      keys.some(
        (k) =>
          !tenantPermissions.includes(
            k as (typeof tenantPermissions)[number],
          ) || !c.permissions.includes(k),
      )
    )
      throw new AccessError('ACCESS_DENIED');
  }
  private async safe(r: AdministrationRepository, c: TenantContext) {
    if (!(await r.hasAdministrator(c))) throw new AccessError('ADMIN_LOCKOUT');
  }
  async organization(p: AuthenticatedPrincipal, o: unknown) {
    return this.run(p, o, 'organization.manage', (r, c) => r.organization(c));
  }
  async updateOrganization(
    p: AuthenticatedPrincipal,
    o: unknown,
    body: unknown,
    requestId: string,
  ) {
    const { version, ...input } = parse(organizationSettingsUpdateSchema, body);
    return this.run(p, o, 'organization.manage', async (r, c) => {
      const row = await r.updateOrganization(
        c,
        Object.fromEntries(
          Object.entries(input).filter(([, v]) => v !== undefined),
        ) as Partial<Omit<OrganizationSettings, 'id' | 'updatedAt'>>,
        version,
      );
      await r.audit(
        c,
        requestId,
        'ORGANIZATION_SETTINGS_CHANGED',
        'Organization',
        c.organizationId,
        { changes: Object.keys(input) },
      );
      return row;
    });
  }
  async permissions(p: AuthenticatedPrincipal, o: unknown) {
    return this.run(p, o, 'roles.manage', async (_r, c) =>
      tenantPermissions.map((key) => ({
        key,
        group: key.startsWith('finance.acquisition_cost.')
          ? 'acquisition'
          : key.startsWith('rentals.pricing.')
            ? 'pricing'
            : key.startsWith('maintenance.costs.')
              ? 'costs'
              : key.split('.')[0]!,
        sensitive:
          key.startsWith('finance.') ||
          key.includes('.pricing.') ||
          key.includes('.costs.'),
        grantable: c.permissions.includes(key),
      })),
    );
  }
  async roles(p: AuthenticatedPrincipal, o: unknown, q: unknown) {
    return this.run(p, o, 'roles.manage', (r, c) =>
      r.roles(c, parse(adminQuerySchema, q)),
    );
  }
  async members(p: AuthenticatedPrincipal, o: unknown, q: unknown) {
    return this.run(p, o, 'users.manage', (r, c) =>
      r.members(c, parse(adminQuerySchema, q)),
    );
  }
  async member(p: AuthenticatedPrincipal, o: unknown, id: unknown) {
    return this.run(p, o, 'users.manage', async (r, c) => {
      const m = await r.member(c, parse(identifierSchema, id));
      if (!m) throw new AccessError('NOT_FOUND');
      return m;
    });
  }
  async createRole(
    p: AuthenticatedPrincipal,
    o: unknown,
    body: unknown,
    requestId: string,
  ) {
    const input = parse(adminRoleInputSchema, body);
    return this.run(p, o, 'roles.manage', async (r, c) => {
      this.ceiling(c, input.permissions);
      const row = await r.saveRole(c, { ...input, enabled: true });
      await r.audit(c, requestId, 'ROLE_CREATED', 'Role', row.id, {
        changes: ['name', 'permissions'],
        after: { permissions: row.permissions, enabled: true },
      });
      return row;
    });
  }
  async updateRole(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    const input = parse(adminRoleUpdateSchema, body);
    return this.run(p, o, 'roles.manage', async (r, c) => {
      const before = await r.role(c, parse(identifierSchema, id));
      if (!before) throw new AccessError('NOT_FOUND');
      this.ceiling(c, [...before.permissions, ...(input.permissions ?? [])]);
      if (
        input.enabled === false &&
        (before.memberCount > 0 || before.pendingInvitationCount > 0)
      )
        throw new AccessError('ROLE_IN_USE');
      const row = await r.saveRole(
        c,
        {
          name: input.name ?? before.name,
          permissions: input.permissions ?? before.permissions,
          enabled: input.enabled ?? before.enabled,
        },
        before.id,
        input.version,
      );
      await this.safe(r, c);
      const { version: _, ...changes } = input;
      void _;
      await r.audit(c, requestId, 'ROLE_CHANGED', 'Role', row.id, {
        changes: Object.keys(changes),
        before: { permissions: before.permissions, enabled: before.enabled },
        after: { permissions: row.permissions, enabled: row.enabled },
      });
      return row;
    });
  }
  private async grants(
    r: AdministrationRepository,
    c: TenantContext,
    m: AdminMember,
    enabled: boolean,
  ) {
    const roles: AdminRole[] = [];
    for (const id of m.roleIds) {
      const role = await r.role(c, id);
      if (!role || (enabled && !role.enabled))
        throw new AccessError('INVALID_INPUT');
      roles.push(role);
    }
    this.ceiling(
      c,
      roles.flatMap((r) => r.permissions),
    );
  }
  async updateMember(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    const input = parse(adminMemberUpdateSchema, body);
    return this.run(p, o, 'users.manage', async (r, c) => {
      requirePermission(c, 'roles.manage');
      const before = await r.member(c, parse(identifierSchema, id));
      if (!before) throw new AccessError('NOT_FOUND');
      await this.grants(r, c, before, false);
      const after = {
        ...before,
        status: input.status ?? before.status,
        roleIds: input.roleIds ?? before.roleIds,
        branchScope: input.branchScope ?? before.branchScope,
        branchIds: input.branchIds ?? before.branchIds,
      };
      if (
        (after.branchScope === 'ALL_BRANCHES' && after.branchIds.length) ||
        (after.status === 'ACTIVE' && after.userStatus !== 'ACTIVE')
      )
        throw new AccessError('INVALID_INPUT');
      await this.grants(r, c, after, after.status === 'ACTIVE');
      if (
        (input.branchIds !== undefined ||
          input.branchScope !== undefined ||
          input.status === 'ACTIVE') &&
        !(await r.activeBranches(c, after.branchIds))
      )
        throw new AccessError('INVALID_INPUT');
      const row = await r.saveMember(c, after, input.version);
      await this.safe(r, c);
      const snapshot = (m: AdminMember) => ({
        status: m.status,
        roleIds: m.roleIds,
        branchScope: m.branchScope,
        branchIds: m.branchIds,
      });
      const { version: _, ...changes } = input;
      void _;
      await r.audit(c, requestId, 'MEMBERSHIP_CHANGED', 'Membership', row.id, {
        changes: Object.keys(changes),
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
  }
  async branches(p: AuthenticatedPrincipal, o: unknown, q: unknown) {
    return this.run(
      p,
      o,
      'branches.manage',
      (r, c) => r.branches(c, parse(adminQuerySchema, q)),
      false,
    );
  }
  async createBranch(
    p: AuthenticatedPrincipal,
    o: unknown,
    body: unknown,
    requestId: string,
  ) {
    const input = parse(adminBranchCreateSchema, body);
    return this.run(p, o, 'branches.manage', async (r, c) => {
      const row = await r.createBranch(c, input.name);
      await r.audit(c, requestId, 'BRANCH_CREATED', 'Branch', row.id, {
        changes: ['name', 'active'],
      });
      return row;
    });
  }
  async invitations(p: AuthenticatedPrincipal, o: unknown, q: unknown) {
    return this.run(p, o, 'users.manage', (r, c) =>
      r.invitations(c, parse(adminQuerySchema, q)),
    );
  }
  async audit(p: AuthenticatedPrincipal, o: unknown, q: unknown) {
    return this.run(p, o, 'audit.read', (r, c) =>
      r.auditEvents(c, parse(adminQuerySchema, q)),
    );
  }
}
