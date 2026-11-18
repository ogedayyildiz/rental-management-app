import {
  machineMaintenancePlanSchema,
  workOrderCreateSchema,
  workOrderPatchSchema,
  maintenanceSearchSchema,
  maintenanceTransitionSchema,
  maintenanceTaskSchema,
  maintenanceMaterialSchema,
  maintenanceCostSchema,
  maintenanceBlockSchema,
  maintenanceReleaseSchema,
  maintenancePlanSchema,
  identifierSchema,
} from '@rental/validation';
import type { WorkOrderView, MachineView } from '@rental/validation';
import type { TenantPermission } from '@rental/permissions';
import { AccessService, requirePermission } from '../access/access.service.js';
import type {
  AuthenticatedPrincipal,
  TenantContext,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type { AuditRecord } from '../audit/audit.service.js';
import type { MaintenanceRepositories } from './contracts.js';
import type { MaintenanceUnitOfWork } from './contracts.js';
function parse<T>(
  schema: {
    safeParse(v: unknown): { success: true; data: T } | { success: false };
  },
  v: unknown,
): T {
  const result = schema.safeParse(v);
  if (!result.success) throw new AccessError('INVALID_INPUT');
  return result.data;
}
const closed = (row: WorkOrderView) =>
  ['COMPLETED', 'CANCELLED'].includes(row.status);
const strength = [
  'NORMAL',
  'MAINTENANCE_DUE',
  'MAINTENANCE_REQUIRED',
  'OUT_OF_SERVICE',
  'SERVICE_BLOCKED',
] as const;
export class MaintenanceService {
  constructor(
    private readonly unit: MaintenanceUnitOfWork,
    private readonly now = () => new Date(),
  ) {}
  private run<T>(
    p: AuthenticatedPrincipal,
    o: unknown,
    permission: TenantPermission,
    write: boolean,
    work: (r: MaintenanceRepositories, c: TenantContext) => Promise<T>,
  ) {
    return this.unit.run(async (r) => {
      const c = await new AccessService(r.access).tenant(p, o);
      requirePermission(c, permission);
      if (write) await r.maintenance.lock(c);
      return work(r, c);
    });
  }
  private async audit(
    r: MaintenanceRepositories,
    c: TenantContext,
    id: string,
    action: AuditRecord['action'],
    requestId: string,
    targetType: AuditRecord['targetType'] = 'WorkOrder',
    metadata: AuditRecord['metadata'] = {},
  ) {
    await r.audit.append({
      organizationId: c.organizationId,
      actorUserId: c.userId,
      actorType: 'USER',
      action,
      targetType,
      targetId: id,
      result: 'SUCCESS',
      source: 'api',
      requestId: parse(identifierSchema, requestId),
      metadata,
    });
  }
  private async row(r: MaintenanceRepositories, c: TenantContext, id: unknown) {
    const row = await r.maintenance.find(
      c,
      parse(identifierSchema, id),
      this.now(),
    );
    if (!row) throw new AccessError('NOT_FOUND');
    return row;
  }
  private visible(c: TenantContext, row: WorkOrderView) {
    if (c.permissions.includes('maintenance.costs.view')) return row;
    const { costs, ...result } = row;
    void costs;
    return result;
  }
  private async project(
    r: MaintenanceRepositories,
    c: TenantContext,
    machineId: string,
    requestId: string,
  ) {
    const m = await r.maintenance.machine(c, machineId);
    if (!m) throw new AccessError('NOT_FOUND');
    const restrictions = await r.maintenance.restrictions(c, machineId);
    const next = restrictions.reduce<MachineView['serviceState']>(
      (state, x) =>
        strength.indexOf(x.state) > strength.indexOf(state) ? x.state : state,
      'NORMAL',
    );
    if (next !== m.serviceState) {
      await r.maintenance.project(c, machineId, next);
      await this.audit(
        r,
        c,
        machineId,
        'MACHINE_SERVICE_STATE_CHANGED',
        requestId,
        'Machine',
        { previousState: m.serviceState, nextState: next },
      );
    }
  }
  private async sync(
    r: MaintenanceRepositories,
    c: TenantContext,
    row: WorkOrderView,
    requestId: string,
  ) {
    const previous = (
      await r.maintenance.restrictions(c, row.machineId)
    ).filter((x) => x.workOrderId === row.id);
    for (const x of previous)
      await r.maintenance.release(c, x.id, 'Work order transition', this.now());
    if (!closed(row) && row.status !== 'DRAFT') {
      const state =
        row.impact === 'SAFETY_CRITICAL'
          ? 'SERVICE_BLOCKED'
          : row.status === 'IN_PROGRESS'
            ? 'OUT_OF_SERVICE'
            : row.impact === 'RENTAL_BLOCKING'
              ? 'MAINTENANCE_REQUIRED'
              : row.impact === 'WARNING'
                ? 'MAINTENANCE_DUE'
                : null;
      if (state)
        await r.maintenance.block(
          c,
          row.machineId,
          state,
          'Work order restriction',
          row.id,
        );
    }
    await this.project(r, c, row.machineId, requestId);
  }
  list(p: AuthenticatedPrincipal, o: unknown, q: unknown) {
    return this.run(p, o, 'maintenance.read', false, async (r, c) => {
      const page = await r.maintenance.list(
        c,
        parse(maintenanceSearchSchema, q),
        this.now(),
      );
      return { ...page, items: page.items.map((x) => this.visible(c, x)) };
    });
  }
  get(p: AuthenticatedPrincipal, o: unknown, id: unknown) {
    return this.run(p, o, 'maintenance.read', false, async (r, c) =>
      this.visible(c, await this.row(r, c, id)),
    );
  }
  create(
    p: AuthenticatedPrincipal,
    o: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'maintenance.create', true, async (r, c) => {
      const input = parse(workOrderCreateSchema, body);
      await r.maintenance.validateReferences(c, input);
      const id = await r.maintenance.create(c, input, this.now());
      await this.audit(r, c, id, 'MAINTENANCE_CREATED', requestId);
      return this.visible(c, await this.row(r, c, id));
    });
  }
  update(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'maintenance.update', true, async (r, c) => {
      const row = await this.row(r, c, id);
      if (closed(row)) throw new AccessError('INVALID_TRANSITION');
      const patch = parse(workOrderPatchSchema, body);
      if (
        row.status === 'IN_PROGRESS' &&
        Object.keys(patch).some(
          (key) => !['diagnosis', 'technicianNotes'].includes(key),
        )
      )
        throw new AccessError('INVALID_TRANSITION');
      const input = parse(workOrderCreateSchema, {
        ...workOrderCreateSchema.strip().parse(row),
        ...patch,
      });
      await r.maintenance.validateReferences(c, input);
      if (row.status === 'PLANNED' && (!input.plannedAt || !input.plannedEndAt))
        throw new AccessError('INVALID_INPUT');

      if (
        row.status !== 'DRAFT' &&
        patch.impact !== undefined &&
        patch.impact !== row.impact
      ) {
        requirePermission(c, 'maintenance.block_machine');
        requirePermission(c, 'maintenance.release_machine');
      }
      await r.maintenance.update(c, row.id, patch);
      await this.sync(r, c, await this.row(r, c, row.id), requestId);
      if (row.status === 'PLANNED' && input.plannedAt && input.plannedEndAt)
        await r.maintenance.checkSchedule(
          c,
          input.plannedAt,
          input.plannedEndAt,
          this.now(),
        );
      await this.audit(r, c, row.id, 'MAINTENANCE_UPDATED', requestId);
      if (row.branchId !== input.branchId)
        await this.audit(
          r,
          c,
          row.id,
          'MAINTENANCE_UPDATED',
          requestId,
          'WorkOrder',
          { previousBranchId: row.branchId, nextBranchId: input.branchId },
        );
      return this.visible(c, await this.row(r, c, row.id));
    });
  }
  transition(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    action: 'open' | 'schedule' | 'start' | 'complete' | 'cancel',
    body: unknown,
    requestId: string,
  ) {
    const permission = {
      open: 'maintenance.schedule',
      schedule: 'maintenance.schedule',
      start: 'maintenance.start',
      complete: 'maintenance.complete',
      cancel: 'maintenance.cancel',
    } as const;
    return this.run(p, o, permission[action], true, async (r, c) => {
      const row = await this.row(r, c, id),
        input = parse(maintenanceTransitionSchema, body),
        target = {
          open: 'OPEN',
          schedule: 'PLANNED',
          start: 'IN_PROGRESS',
          complete: 'COMPLETED',
          cancel: 'CANCELLED',
        } as const;
      if (row.status === target[action]) return this.visible(c, row);
      const allowed = {
        open: ['DRAFT'],
        schedule: ['OPEN'],
        start: ['OPEN', 'PLANNED'],
        complete: ['IN_PROGRESS'],
        cancel: ['DRAFT', 'OPEN', 'PLANNED', 'IN_PROGRESS'],
      } as const;
      if (!(allowed[action] as readonly string[]).includes(row.status))
        throw new AccessError('INVALID_TRANSITION');
      if (action === 'cancel' && !input.reason)
        throw new AccessError('INVALID_INPUT');
      if (
        action === 'complete' &&
        (!input.notes || row.tasks.some((t) => !t.completedAt))
      )
        throw new AccessError('INVALID_INPUT');
      if (action === 'schedule' && (!row.plannedAt || !row.plannedEndAt))
        throw new AccessError('INVALID_INPUT');
      const machine = await r.maintenance.machine(c, row.machineId);
      if (!machine) throw new AccessError('NOT_FOUND');
      if (
        ['open', 'schedule', 'start'].includes(action) &&
        machine.lifecycleState !== 'ACTIVE'
      )
        throw new AccessError('MACHINE_ARCHIVED');
      if (action === 'start' && machine.rentalState === 'RENTED')
        throw new AccessError('MACHINE_COMMITTED');
      if (
        ['open', 'schedule', 'start'].includes(action) &&
        (row.impact === 'RENTAL_BLOCKING' ||
          row.impact === 'SAFETY_CRITICAL' ||
          action === 'start')
      )
        requirePermission(c, 'maintenance.block_machine');
      if (
        ['complete', 'cancel'].includes(action) &&
        (await r.maintenance.restrictions(c, row.machineId)).some(
          (x) => x.workOrderId === row.id,
        )
      )
        requirePermission(c, 'maintenance.release_machine');
      const transitionAt = this.now();
      await r.maintenance.transition(
        c,
        row.id,
        target[action],
        transitionAt,
        input.notes,
        input.reason,
      );
      await this.sync(r, c, await this.row(r, c, row.id), requestId);
      if (action === 'schedule' && row.plannedAt && row.plannedEndAt)
        await r.maintenance.checkSchedule(
          c,
          row.plannedAt,
          row.plannedEndAt,
          this.now(),
        );
      if (action === 'complete')
        await r.maintenance.advanceSchedule(c, row.id, transitionAt);
      const audit = {
        open: 'MAINTENANCE_OPENED',
        schedule: 'MAINTENANCE_PLANNED',
        start: 'MAINTENANCE_STARTED',
        complete: 'MAINTENANCE_COMPLETED',
        cancel: 'MAINTENANCE_CANCELLED',
      } as const;
      await this.audit(r, c, row.id, audit[action], requestId, 'WorkOrder', {
        previousState: row.status,
        nextState: target[action],
      });
      return this.visible(c, await this.row(r, c, row.id));
    });
  }
  mutateChild(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    kind: 'task' | 'material' | 'cost',
    body: unknown,
    requestId: string,
    taskId?: unknown,
  ) {
    return this.run(
      p,
      o,
      kind === 'cost' ? 'maintenance.costs.edit' : 'maintenance.update',
      true,
      async (r, c) => {
        const row = await this.row(r, c, id);
        if (closed(row)) throw new AccessError('INVALID_TRANSITION');
        if (kind === 'task') {
          if (row.status !== 'IN_PROGRESS')
            throw new AccessError('INVALID_TRANSITION');
          const v = parse(maintenanceTaskSchema, body);
          await r.maintenance.task(
            c,
            row.id,
            parse(identifierSchema, taskId),
            v.completed,
            v.notes,
            this.now(),
          );
        } else if (kind === 'material')
          await r.maintenance.material(
            c,
            row.id,
            parse(maintenanceMaterialSchema, body),
          );
        else
          await r.maintenance.cost(
            c,
            row.id,
            parse(maintenanceCostSchema, body),
          );
        await this.audit(
          r,
          c,
          row.id,
          kind === 'task'
            ? 'MAINTENANCE_CHECKLIST_CHANGED'
            : kind === 'material'
              ? 'MAINTENANCE_MATERIAL_ADDED'
              : 'MAINTENANCE_COST_ADDED',
          requestId,
        );
        return this.visible(c, await this.row(r, c, row.id));
      },
    );
  }
  block(
    p: AuthenticatedPrincipal,
    o: unknown,
    machineId: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'maintenance.block_machine', true, async (r, c) => {
      const m = await r.maintenance.machine(
        c,
        parse(identifierSchema, machineId),
      );
      if (!m) throw new AccessError('NOT_FOUND');
      const input = parse(maintenanceBlockSchema, body);
      const id = await r.maintenance.block(c, m.id, input.state, input.reason);
      await this.project(r, c, m.id, requestId);
      await this.audit(
        r,
        c,
        id,
        'MAINTENANCE_BLOCKED',
        requestId,
        'ServiceRestriction',
      );
      return { id };
    });
  }
  release(
    p: AuthenticatedPrincipal,
    o: unknown,
    machineId: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'maintenance.release_machine', true, async (r, c) => {
      const m = await r.maintenance.machine(
        c,
        parse(identifierSchema, machineId),
      );
      if (!m) throw new AccessError('NOT_FOUND');
      const restriction = (await r.maintenance.restrictions(c, m.id)).find(
        (x) => x.id === parse(identifierSchema, id),
      );
      if (!restriction) throw new AccessError('NOT_FOUND');
      if (restriction.workOrderId) throw new AccessError('INVALID_TRANSITION');
      const input = parse(maintenanceReleaseSchema, body);
      await r.maintenance.release(c, restriction.id, input.reason, this.now());
      await this.project(r, c, m.id, requestId);
      await this.audit(
        r,
        c,
        restriction.id,
        'MAINTENANCE_RELEASED',
        requestId,
        'ServiceRestriction',
      );
      return { id: restriction.id };
    });
  }
  plans(p: AuthenticatedPrincipal, o: unknown) {
    return this.run(p, o, 'maintenance.read', false, (r, c) =>
      r.maintenance.plans(c),
    );
  }
  savePlan(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'maintenance.plans.manage', true, async (r, c) => {
      const planId = await r.maintenance.savePlan(
        c,
        id === null ? null : parse(identifierSchema, id),
        parse(maintenancePlanSchema, body),
      );
      await this.audit(
        r,
        c,
        planId,
        'MAINTENANCE_PLAN_CHANGED',
        requestId,
        'MaintenancePlan',
      );
      return { id: planId };
    });
  }
  schedules(p: AuthenticatedPrincipal, o: unknown, machineId: unknown) {
    return this.run(p, o, 'maintenance.read', false, (r, c) =>
      r.maintenance.schedules(c, parse(identifierSchema, machineId)),
    );
  }
  saveSchedule(
    p: AuthenticatedPrincipal,
    o: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'maintenance.plans.manage', true, async (r, c) => {
      const id = await r.maintenance.saveSchedule(
        c,
        parse(machineMaintenancePlanSchema, body),
      );
      await this.audit(
        r,
        c,
        id,
        'MAINTENANCE_PLAN_CHANGED',
        requestId,
        'MachineMaintenancePlan',
      );
      return { id };
    });
  }
  restrictions(p: AuthenticatedPrincipal, o: unknown, machineId: unknown) {
    return this.run(p, o, 'maintenance.read', false, async (r, c) => {
      const id = parse(identifierSchema, machineId);
      if (!(await r.maintenance.machine(c, id)))
        throw new AccessError('NOT_FOUND');
      return r.maintenance.restrictions(c, id);
    });
  }
  report(
    p: AuthenticatedPrincipal,
    o: unknown,
    machineId: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'maintenance.export', false, async (r, c) => {
      requirePermission(c, 'maintenance.read');
      const id = parse(identifierSchema, machineId),
        machine = await r.maintenance.machine(c, id);
      if (!machine) throw new AccessError('NOT_FOUND');
      const rows: WorkOrderView[] = [];
      let cursor: string | null = null;
      do {
        const page = await r.maintenance.list(
          c,
          parse(maintenanceSearchSchema, {
            machineId: id,
            limit: 100,
            ...(cursor ? { cursor } : {}),
          }),
          this.now(),
        );
        rows.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      const records = rows.map((x) => ({
        id: x.id,
        number: x.number,
        title: x.title,
        type: x.type,
        status: x.status,
        priority: x.priority,
        plannedAt: x.plannedAt,
        dueAt: x.dueAt,
        startedAt: x.startedAt,
        completedAt: x.completedAt,
        branch: x.branchName,
        materials: x.materials,
        tasks: x.tasks.map((t) => ({
          description: t.description,
          completedAt: t.completedAt,
        })),
      }));
      await this.audit(r, c, id, 'MAINTENANCE_EXPORTED', requestId, 'Machine');
      return {
        organizationId: c.organizationId,
        generatedBy: c.userId,
        generatedAt: this.now().toISOString(),
        machine: {
          id: machine.id,
          fleetNumber: machine.fleetNumber,
          manufacturer: machine.manufacturer,
          model: machine.model,
          serialNumber: machine.serialNumber,
          serviceState: machine.serviceState,
        },
        records,
      };
    });
  }
}
