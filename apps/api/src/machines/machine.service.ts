import {
  machineCreateSchema,
  machinePatchSchema,
  machineSearchSchema,
  machineArchiveSchema,
  machineRestoreSchema,
  identifierSchema,
} from '@rental/validation';
import type { MachineView } from '@rental/validation';
import type { TenantPermission } from '@rental/permissions';
import { AccessService, requirePermission } from '../access/access.service.js';
import type {
  AuthenticatedPrincipal,
  TenantContext,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type { MachineUnitOfWork, MachineRepositories } from './contracts.js';
import type { AuditRecord } from '../audit/audit.service.js';
function parseInput<T>(
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AccessError('INVALID_INPUT');
  return parsed.data;
}
export class MachineService {
  constructor(private readonly unit: MachineUnitOfWork) {}
  private run<T>(
    principal: AuthenticatedPrincipal,
    org: unknown,
    permission: TenantPermission,
    work: (r: MachineRepositories, c: TenantContext) => Promise<T>,
  ) {
    return this.unit.run(async (r) => {
      const c = await new AccessService(r.access).tenant(principal, org);
      requirePermission(c, permission);
      return work(r, c);
    });
  }
  private visible(c: TenantContext, row: MachineView): MachineView {
    if (c.permissions.includes('finance.acquisition_cost.view')) return row;
    const { acquisitionCost: _cost, currency: _currency, ...visible } = row;
    void _cost;
    void _currency;
    return visible;
  }
  private async find(r: MachineRepositories, c: TenantContext, value: unknown) {
    const id = parseInput(identifierSchema, value);
    const row = await r.machines.find(c, id);
    if (!row) throw new AccessError('NOT_FOUND');
    return row;
  }
  private async audit(
    r: MachineRepositories,
    c: TenantContext,
    requestId: string,
    id: string,
    action: AuditRecord['action'],
    metadata: AuditRecord['metadata'] = {},
  ) {
    parseInput(identifierSchema, requestId);
    await r.audit.append({
      organizationId: c.organizationId,
      actorUserId: c.userId,
      actorType: 'USER',
      action,
      targetType: 'Machine',
      targetId: id,
      result: 'SUCCESS',
      source: 'api',
      requestId,
      metadata,
    });
  }
  list(p: AuthenticatedPrincipal, o: unknown, q: unknown) {
    return this.run(p, o, 'machines.read', async (r, c) => {
      const page = await r.machines.list(c, parseInput(machineSearchSchema, q));
      return { ...page, items: page.items.map((row) => this.visible(c, row)) };
    });
  }
  get(p: AuthenticatedPrincipal, o: unknown, id: unknown) {
    return this.run(p, o, 'machines.read', async (r, c) =>
      this.visible(c, await this.find(r, c, id)),
    );
  }
  branches(p: AuthenticatedPrincipal, o: unknown) {
    return this.run(p, o, 'machines.read', (r, c) => r.machines.branches(c));
  }
  create(
    p: AuthenticatedPrincipal,
    o: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'machines.create', async (r, c) => {
      // Inspect supplied fields before defaults so explicit null writes also require financial access.
      const supplied = parseInput(machinePatchSchema, body);
      if ('acquisitionCost' in supplied || 'currency' in supplied)
        requirePermission(c, 'finance.acquisition_cost.edit');
      const input = parseInput(machineCreateSchema, body);
      await r.machines.requireBranch(c, input.branchId);
      const row = await r.machines.save(c, null, input);
      await this.audit(r, c, requestId, row.id, 'MACHINE_CREATED');
      return this.visible(c, row);
    });
  }
  update(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'machines.update', async (r, c) => {
      await r.commitments.lock(c);
      const before = await this.find(r, c, id);
      if (before.lifecycleState !== 'ACTIVE')
        throw new AccessError('MACHINE_ARCHIVED');
      const patch = parseInput(machinePatchSchema, body);
      if ('acquisitionCost' in patch || 'currency' in patch)
        requirePermission(c, 'finance.acquisition_cost.edit');
      const input = parseInput(machineCreateSchema, {
        ...machineCreateSchema.strip().parse(before),
        ...patch,
      });
      await r.machines.requireBranch(c, input.branchId);
      const row = await r.machines.save(c, before.id, input);
      await r.commitments.validate(c, before, row);
      await this.audit(r, c, requestId, row.id, 'MACHINE_UPDATED', {
        previousModelId: before.modelId,
        nextModelId: row.modelId,
      });
      if (before.branchId !== row.branchId)
        await this.audit(r, c, requestId, row.id, 'MACHINE_BRANCH_CHANGED', {
          previousBranchId: before.branchId,
          nextBranchId: row.branchId,
        });
      if (before.serviceState !== row.serviceState)
        await this.audit(
          r,
          c,
          requestId,
          row.id,
          'MACHINE_SERVICE_STATE_CHANGED',
          { previousState: before.serviceState, nextState: row.serviceState },
        );
      return this.visible(c, row);
    });
  }
  restore(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'machines.archive', async (r, c) => {
      const input = parseInput(machineRestoreSchema, body);
      await r.commitments.lock(c);
      const before = await this.find(r, c, id);
      if (before.lifecycleState === 'ACTIVE') return this.visible(c, before);
      if (before.rentalState !== 'NOT_RENTED')
        throw new AccessError('MACHINE_COMMITTED');
      await r.machines.requireBranch(c, before.branchId);
      const row = await r.machines.restore(c, before.id);
      await this.audit(r, c, requestId, row.id, 'MACHINE_RESTORED', {
        previousState: before.lifecycleState,
        nextState: row.lifecycleState,
        reasonCode: input.reasonCode,
      });
      return this.visible(c, row);
    });
  }
  archive(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'machines.archive', async (r, c) => {
      const input = parseInput(machineArchiveSchema, body);
      await r.commitments.lock(c);
      const before = await this.find(r, c, id);
      if (before.lifecycleState === input.lifecycleState)
        return this.visible(c, before);
      if (
        before.lifecycleState !== 'ACTIVE' ||
        before.rentalState !== 'NOT_RENTED'
      )
        throw new AccessError(
          before.rentalState !== 'NOT_RENTED'
            ? 'MACHINE_COMMITTED'
            : 'MACHINE_ARCHIVED',
        );
      const row = await r.machines.archive(c, before.id, input.lifecycleState);
      await r.commitments.validate(c, before, row);
      await this.audit(r, c, requestId, row.id, 'MACHINE_LIFECYCLE_CHANGED', {
        previousState: before.lifecycleState,
        nextState: row.lifecycleState,
      });
      await this.audit(r, c, requestId, row.id, 'MACHINE_ARCHIVED');
      return this.visible(c, row);
    });
  }
}
