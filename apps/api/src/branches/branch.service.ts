import { branchUpdateSchema, identifierSchema } from '@rental/validation';
import { AccessService, requirePermission } from '../access/access.service.js';
import type {
  AuthenticatedPrincipal,
  TenantContext,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type { AccessRepository } from '../access/contracts.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuditRepository } from '../audit/audit.service.js';

export interface BranchView {
  id: string;
  organizationId: string;
  name: string;
  active: boolean;
}
export interface BranchRepository {
  find(context: TenantContext, id: string): Promise<BranchView | null>;
  rename(
    context: TenantContext,
    id: string,
    name: string,
  ): Promise<BranchView | null>;
}
export interface FoundationRepositories {
  access: AccessRepository;
  branches: BranchRepository;
  audit: AuditRepository;
}
export abstract class FoundationUnitOfWork {
  abstract run<T>(
    work: (repositories: FoundationRepositories) => Promise<T>,
  ): Promise<T>;
}

export class BranchService {
  constructor(private readonly unitOfWork: FoundationUnitOfWork) {}

  async find(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    branchId: unknown,
  ): Promise<BranchView> {
    return this.unitOfWork.run(async (repositories) => {
      const context = await new AccessService(repositories.access).tenant(
        principal,
        organizationId,
      );
      requirePermission(context, 'branches.manage');
      const id = identifierSchema.safeParse(branchId);
      if (!id.success) throw new AccessError('INVALID_INPUT');
      const branch = await repositories.branches.find(context, id.data);
      if (!branch) throw new AccessError('NOT_FOUND');
      return branch;
    });
  }

  async rename(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    branchId: unknown,
    input: unknown,
    requestId: string,
  ): Promise<BranchView> {
    return this.unitOfWork.run(async (repositories) => {
      // Re-resolve access within the transaction; a guard's earlier snapshot is not authority.
      const context = await new AccessService(repositories.access).tenant(
        principal,
        organizationId,
      );
      requirePermission(context, 'branches.manage');
      const id = identifierSchema.safeParse(branchId);
      const body = branchUpdateSchema.safeParse(input);
      if (!id.success || !body.success) throw new AccessError('INVALID_INPUT');
      const before = await repositories.branches.find(context, id.data);
      if (!before) throw new AccessError('NOT_FOUND');
      const after = await repositories.branches.rename(
        context,
        id.data,
        body.data.name,
      );
      if (!after) throw new AccessError('NOT_FOUND');
      await new AuditService(repositories.audit).branchUpdated(
        context,
        requestId,
        after.id,
        before.name,
        after.name,
      );
      return after;
    });
  }
}
