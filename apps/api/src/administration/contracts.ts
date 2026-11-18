import type {
  AdminQuery,
  AdminRole,
  AdminMember,
  AdminInvitation,
  AdminAudit,
  AdminBranch,
  OrganizationSettings,
  AdminRoleInput,
  AdminMetadata,
} from '@rental/validation';
import type { AccessRepository } from '../access/contracts.js';
import type { TenantContext } from '../access/access.service.js';
export type Page<T> = { items: T[]; nextCursor: string | null };
export interface AdministrationRepository {
  lock(organizationId: string): Promise<void>;
  organization(c: TenantContext): Promise<OrganizationSettings>;
  updateOrganization(
    c: TenantContext,
    input: Partial<Omit<OrganizationSettings, 'id' | 'updatedAt'>>,
    version: string,
  ): Promise<OrganizationSettings>;
  roles(c: TenantContext, q: AdminQuery): Promise<Page<AdminRole>>;
  role(c: TenantContext, id: string): Promise<AdminRole | null>;
  saveRole(
    c: TenantContext,
    input: AdminRoleInput & { enabled: boolean },
    id?: string,
    version?: string,
  ): Promise<AdminRole>;
  members(c: TenantContext, q: AdminQuery): Promise<Page<AdminMember>>;
  member(c: TenantContext, id: string): Promise<AdminMember | null>;
  saveMember(
    c: TenantContext,
    row: AdminMember,
    version: string,
  ): Promise<AdminMember>;
  activeBranches(c: TenantContext, ids: string[]): Promise<boolean>;
  hasAdministrator(c: TenantContext): Promise<boolean>;
  branches(c: TenantContext, q: AdminQuery): Promise<Page<AdminBranch>>;
  createBranch(c: TenantContext, name: string): Promise<AdminBranch>;
  invitations(c: TenantContext, q: AdminQuery): Promise<Page<AdminInvitation>>;
  auditEvents(c: TenantContext, q: AdminQuery): Promise<Page<AdminAudit>>;
  audit(
    c: TenantContext,
    requestId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: AdminMetadata,
  ): Promise<void>;
}
export abstract class AdministrationUnitOfWork {
  abstract run<T>(
    fn: (r: {
      access: AccessRepository;
      admin: AdministrationRepository;
    }) => Promise<T>,
  ): Promise<T>;
}
