import { assertSchedule } from '../rentals/availability.js';
import { PrismaRentalRepository } from './prisma.rentals.js';
import { Prisma } from '@rental/database';
import type { PrismaClient } from '@rental/database';
import { workOrderViewSchema, maintenancePlanSchema } from '@rental/validation';
import type {
  WorkOrderInput,
  WorkOrderPatch,
  MaintenanceSearch,
  MaintenancePlanInput,
  WorkOrderView,
  MachineView,
} from '@rental/validation';
import { assertTenantContext } from '../access/access.service.js';
import type { TenantContext } from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import { MaintenanceUnitOfWork } from '../maintenance/contracts.js';
import type {
  MaintenanceRepository,
  MaintenanceRepositories,
} from '../maintenance/contracts.js';
import {
  PrismaAccessRepository,
  PrismaAuditRepository,
} from './prisma.repositories.js';
import { PrismaMachineRepository } from './prisma.machines.js';
const include = {
  machine: { include: { model: true } },
  branch: true,
  organization: true,
  tasks: true,
  materials: true,
  costs: true,
} as const;
export function maintenanceScope(c: TenantContext): Prisma.WorkOrderWhereInput {
  assertTenantContext(c);
  return {
    organizationId: c.organizationId,
    ...(c.branchScope === 'ALL_BRANCHES'
      ? {}
      : {
          branchId: { in: [...c.branchIds] },
          machine: { branchId: { in: [...c.branchIds] } },
        }),
  };
}
export class PrismaMaintenanceRepository implements MaintenanceRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}
  async lock(c: TenantContext) {
    assertTenantContext(c);
    await this.db
      .$executeRaw`UPDATE "Organization" SET name=name WHERE id=${c.organizationId}::uuid`;
  }
  async checkSchedule(c: TenantContext, from: string, to: string, now: Date) {
    const rentals = new PrismaRentalRepository(this.db);
    assertSchedule(
      await rentals.commitments(c),
      await rentals.machines(c),
      from,
      to,
      now.getTime(),
    );
  }
  machine(c: TenantContext, id: string) {
    return new PrismaMachineRepository(this.db).find(c, id);
  }
  private view(
    row: Prisma.WorkOrderGetPayload<{ include: typeof include }>,
    now: Date,
  ): WorkOrderView {
    return workOrderViewSchema.parse({
      ...row,
      fleetNumber: row.machine.fleetNumber,
      manufacturer: row.machine.model.manufacturer,
      model: row.machine.model.name,
      serviceState: row.machine.serviceState,
      branchName: row.branch?.name ?? null,
      timezone: row.organization.timezone,
      overdue:
        !['COMPLETED', 'CANCELLED'].includes(row.status) &&
        row.dueAt !== null &&
        row.dueAt < now,
      ...Object.fromEntries(
        [
          'plannedAt',
          'plannedEndAt',
          'dueAt',
          'startedAt',
          'completedAt',
          'cancelledAt',
          'createdAt',
          'updatedAt',
        ].map((k) => [
          k,
          (row[k as 'createdAt'] as Date | null)?.toISOString() ?? null,
        ]),
      ),
      tasks: row.tasks.map((t) => ({
        ...t,
        completedAt: t.completedAt?.toISOString() ?? null,
      })),
      materials: row.materials.map((m) => ({
        id: m.id,
        description: m.description,
        partNumber: m.partNumber,
        unit: m.unit,
        quantity: m.quantity.toFixed(),
      })),
      costs: row.costs.map((v) => ({
        id: v.id,
        kind: v.kind,
        currency: v.currency,
        description: v.description,
        amount: v.amount.toFixed(),
      })),
    });
  }
  async find(c: TenantContext, id: string, now: Date) {
    const row = await this.db.workOrder.findFirst({
      where: { ...maintenanceScope(c), id },
      include,
    });
    return row ? this.view(row, now) : null;
  }
  async list(c: TenantContext, q: MaintenanceSearch, now: Date) {
    const and: Prisma.WorkOrderWhereInput[] = [];
    if (q.branchId) and.push({ branchId: q.branchId });
    if (q.machineId) and.push({ machineId: q.machineId });
    if (q.status) and.push({ status: q.status });
    if (q.type) and.push({ type: q.type });
    if (q.priority) and.push({ priority: q.priority });
    if (q.open)
      and.push({
        status:
          q.open === 'true'
            ? { notIn: ['COMPLETED', 'CANCELLED'] }
            : { in: ['COMPLETED', 'CANCELLED'] },
      });
    const overdue: Prisma.WorkOrderWhereInput = {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
      dueAt: { lt: now },
    };
    if (q.overdue) and.push(q.overdue === 'true' ? overdue : { NOT: overdue });
    if (q.plannedFrom || q.plannedTo)
      and.push({
        plannedAt: {
          ...(q.plannedFrom ? { gte: new Date(q.plannedFrom) } : {}),
          ...(q.plannedTo ? { lte: new Date(q.plannedTo) } : {}),
        },
      });
    if (q.dueFrom || q.dueTo)
      and.push({
        dueAt: {
          ...(q.dueFrom ? { gte: new Date(q.dueFrom) } : {}),
          ...(q.dueTo ? { lte: new Date(q.dueTo) } : {}),
        },
      });
    if (q.q)
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { title: { contains: q.q, mode: 'insensitive' } },
          { machine: { fleetNumber: { contains: q.q, mode: 'insensitive' } } },
        ],
      });
    if (q.cursor) {
      const [time, id] = q.cursor.split('|');
      and.push({
        OR: [
          { createdAt: { lt: new Date(time!) } },
          { createdAt: new Date(time!), id: { lt: id! } },
        ],
      });
    }
    const rows = await this.db.workOrder.findMany({
      where: { ...maintenanceScope(c), AND: and },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const items = rows.slice(0, q.limit).map((r) => this.view(r, now)),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > q.limit && last ? last.createdAt + '|' + last.id : null,
    };
  }
  async validateReferences(c: TenantContext, input: WorkOrderInput) {
    assertTenantContext(c);
    const machine = await this.machine(c, input.machineId);
    if (!machine) throw new AccessError('NOT_FOUND');
    if (machine.lifecycleState !== 'ACTIVE')
      throw new AccessError('MACHINE_ARCHIVED');
    if (input.branchId === null && c.branchScope !== 'ALL_BRANCHES')
      throw new AccessError('ACCESS_DENIED');
    if (
      input.branchId &&
      !(await this.db.branch.findFirst({
        where: {
          organizationId: c.organizationId,
          id: input.branchId,
          active: true,
          ...(c.branchScope === 'ALL_BRANCHES'
            ? {}
            : { id: { in: [...c.branchIds], equals: input.branchId } }),
        },
      }))
    )
      throw new AccessError('NOT_FOUND');
    if (
      input.assignedMembershipId &&
      !(await this.db.membership.findFirst({
        where: {
          organizationId: c.organizationId,
          id: input.assignedMembershipId,
          status: 'ACTIVE',
          user: { status: 'ACTIVE' },
          OR: [
            { branchScope: 'ALL_BRANCHES' },
            ...(input.branchId
              ? [{ branches: { some: { branchId: input.branchId } } }]
              : []),
          ],
        },
      }))
    )
      throw new AccessError('INVALID_INPUT');
    if (
      input.machinePlanId &&
      !(await this.db.machineMaintenancePlan.findFirst({
        where: {
          organizationId: c.organizationId,
          id: input.machinePlanId,
          machineId: input.machineId,
          active: true,
          plan: { active: true },
        },
      }))
    )
      throw new AccessError('NOT_FOUND');
    if (
      input.plannedEndAt &&
      (!input.plannedAt || input.plannedEndAt <= input.plannedAt)
    )
      throw new AccessError('INVALID_INPUT');
  }
  async create(c: TenantContext, input: WorkOrderInput, now: Date) {
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: c.organizationId },
      select: { timezone: true },
    });
    const year = Number(
      new Intl.DateTimeFormat('en', {
        year: 'numeric',
        timeZone: org.timezone,
      }).format(now),
    );
    const count = await this.db.maintenanceCounter.upsert({
      where: {
        organizationId_year: { organizationId: c.organizationId, year },
      },
      create: { organizationId: c.organizationId, year, value: 1 },
      update: { value: { increment: 1 } },
    });
    const { checklist, ...fields } = input;
    const schedule = input.machinePlanId
      ? await this.db.machineMaintenancePlan.findFirstOrThrow({
          where: { organizationId: c.organizationId, id: input.machinePlanId },
          include: { plan: true },
        })
      : null;
    const planSnapshot = schedule
      ? {
          ...maintenancePlanSchema.strip().parse(schedule.plan),
          scheduledDueAt: schedule.nextDueAt.toISOString(),
        }
      : undefined;
    const row = await this.db.workOrder.create({
      data: {
        ...fields,
        ...(planSnapshot ? { planSnapshot } : {}),
        organizationId: c.organizationId,
        number: 'WO-' + year + '-' + String(count.value).padStart(6, '0'),
        createdById: c.userId,
        updatedById: c.userId,
        tasks: {
          create: checklist.map((description) => ({
            description,
          })),
        },
      },
    });
    return row.id;
  }
  async update(c: TenantContext, id: string, input: WorkOrderPatch) {
    await this.db.workOrder.updateMany({
      where: { ...maintenanceScope(c), id },
      data: {
        ...Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        ),
        updatedById: c.userId,
      },
    });
  }
  async transition(
    c: TenantContext,
    id: string,
    status: WorkOrderView['status'],
    now: Date,
    notes?: string,
    reason?: string,
  ) {
    await this.db.workOrder.updateMany({
      where: { ...maintenanceScope(c), id },
      data: {
        status,
        updatedById: c.userId,
        ...(status === 'IN_PROGRESS' ? { startedAt: now } : {}),
        ...(status === 'COMPLETED'
          ? { completedAt: now, completionNotes: notes ?? null }
          : {}),
        ...(status === 'CANCELLED'
          ? { cancelledAt: now, cancellationReason: reason ?? null }
          : {}),
      },
    });
  }
  async restrictions(c: TenantContext, machineId: string) {
    assertTenantContext(c);
    return this.db.serviceRestriction.findMany({
      where: { organizationId: c.organizationId, machineId, releasedAt: null },
      select: { id: true, state: true, workOrderId: true },
    });
  }
  async block(
    c: TenantContext,
    machineId: string,
    state: MachineView['serviceState'],
    reason: string,
    workOrderId?: string,
  ) {
    assertTenantContext(c);
    return (
      await this.db.serviceRestriction.create({
        data: {
          organizationId: c.organizationId,
          machineId,
          state,
          reason,
          createdById: c.userId,
          ...(workOrderId ? { workOrderId } : {}),
        },
      })
    ).id;
  }
  async release(c: TenantContext, id: string, reason: string, now: Date) {
    assertTenantContext(c);
    await this.db.serviceRestriction.updateMany({
      where: { organizationId: c.organizationId, id, releasedAt: null },
      data: { releasedAt: now, releasedById: c.userId, releaseReason: reason },
    });
  }
  async project(
    c: TenantContext,
    machineId: string,
    state: MachineView['serviceState'],
  ) {
    assertTenantContext(c);
    await this.db.machine.updateMany({
      where: { organizationId: c.organizationId, id: machineId },
      data: { serviceState: state, updatedById: c.userId },
    });
  }
  async task(
    c: TenantContext,
    workOrderId: string,
    id: string,
    completed: boolean,
    notes: string | null,
    now: Date,
  ) {
    assertTenantContext(c);
    const result = await this.db.workOrderTask.updateMany({
      where: { organizationId: c.organizationId, workOrderId, id },
      data: {
        notes,
        completedAt: completed ? now : null,
        completedById: completed ? c.userId : null,
      },
    });
    if (!result.count) throw new AccessError('NOT_FOUND');
  }
  async material(
    c: TenantContext,
    id: string,
    input: Parameters<MaintenanceRepository['material']>[2],
  ) {
    assertTenantContext(c);
    await this.db.workOrderMaterial.create({
      data: {
        ...input,
        quantity: new Prisma.Decimal(input.quantity),
        organizationId: c.organizationId,
        workOrderId: id,
      },
    });
  }
  async cost(
    c: TenantContext,
    id: string,
    input: Parameters<MaintenanceRepository['cost']>[2],
  ) {
    assertTenantContext(c);
    await this.db.workOrderCost.create({
      data: {
        ...input,
        amount: new Prisma.Decimal(input.amount),
        organizationId: c.organizationId,
        workOrderId: id,
      },
    });
  }

  async schedules(c: TenantContext, machineId: string) {
    assertTenantContext(c);
    if (!(await this.machine(c, machineId))) throw new AccessError('NOT_FOUND');
    return (
      await this.db.machineMaintenancePlan.findMany({
        where: { organizationId: c.organizationId, machineId },
        include: { plan: true, machine: true },
      })
    ).map((x) => ({
      id: x.id,
      machineId: x.machineId,
      planId: x.planId,
      nextDueAt: x.nextDueAt.toISOString(),
      active: x.active,
      planName: x.plan.name,
      fleetNumber: x.machine.fleetNumber,
    }));
  }
  async saveSchedule(
    c: TenantContext,
    input: {
      machineId: string;
      planId: string;
      nextDueAt: string;
      active: boolean;
    },
  ) {
    assertTenantContext(c);
    const machine = await this.machine(c, input.machineId);
    if (!machine || machine.lifecycleState !== 'ACTIVE')
      throw new AccessError('NOT_FOUND');
    if (
      !(await this.db.maintenancePlan.findFirst({
        where: {
          organizationId: c.organizationId,
          id: input.planId,
          active: true,
        },
      }))
    )
      throw new AccessError('NOT_FOUND');
    const existing = await this.db.machineMaintenancePlan.findUnique({
      where: {
        organizationId_machineId_planId: {
          organizationId: c.organizationId,
          machineId: input.machineId,
          planId: input.planId,
        },
      },
    });
    if (
      existing &&
      (await this.db.workOrder.count({
        where: {
          organizationId: c.organizationId,
          machinePlanId: existing.id,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }))
    )
      throw new AccessError('CONFLICT');
    return (
      await this.db.machineMaintenancePlan.upsert({
        where: {
          organizationId_machineId_planId: {
            organizationId: c.organizationId,
            machineId: input.machineId,
            planId: input.planId,
          },
        },
        create: { ...input, organizationId: c.organizationId },
        update: { nextDueAt: input.nextDueAt, active: input.active },
      })
    ).id;
  }
  async advanceSchedule(c: TenantContext, id: string, now: Date) {
    assertTenantContext(c);
    const row = await this.db.workOrder.findFirstOrThrow({
      where: { organizationId: c.organizationId, id },
    });
    if (!row.machinePlanId || !row.planSnapshot) return;
    // Deactivation stops future recurrence without changing the historical work order.
    if (
      !(await this.db.machineMaintenancePlan.findFirst({
        where: {
          organizationId: c.organizationId,
          id: row.machinePlanId,
          active: true,
          plan: { active: true },
        },
      }))
    )
      return;
    const plan = maintenancePlanSchema.passthrough().parse(row.planSnapshot);
    const snapshot = row.planSnapshot as { scheduledDueAt: string };
    const next = new Date(
      plan.intervalBasis === 'COMPLETION' ? now : snapshot.scheduledDueAt,
    );
    if (plan.intervalUnit === 'DAYS')
      next.setUTCDate(next.getUTCDate() + plan.interval);
    else {
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + plan.interval);
      const last = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(Math.min(day, last));
    }
    await this.db.machineMaintenancePlan.updateMany({
      where: { organizationId: c.organizationId, id: row.machinePlanId },
      data: { nextDueAt: next },
    });
  }
  async plans(c: TenantContext) {
    assertTenantContext(c);
    return (
      await this.db.maintenancePlan.findMany({
        where: { organizationId: c.organizationId },
        orderBy: { name: 'asc' },
      })
    ).map((p) => ({ id: p.id, ...maintenancePlanSchema.strip().parse(p) }));
  }
  async savePlan(
    c: TenantContext,
    id: string | null,
    input: MaintenancePlanInput,
  ) {
    assertTenantContext(c);
    if (id) {
      const result = await this.db.maintenancePlan.updateMany({
        where: { organizationId: c.organizationId, id },
        data: input,
      });
      if (!result.count) throw new AccessError('NOT_FOUND');
      return id;
    }
    return (
      await this.db.maintenancePlan.create({
        data: { ...input, organizationId: c.organizationId },
      })
    ).id;
  }
}
export class PrismaMaintenanceUnitOfWork extends MaintenanceUnitOfWork {
  constructor(private readonly db: PrismaClient) {
    super();
  }
  override async run<T>(
    work: (r: MaintenanceRepositories) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        (tx) =>
          work({
            access: new PrismaAccessRepository(tx),
            audit: new PrismaAuditRepository(tx),
            maintenance: new PrismaMaintenanceRepository(tx),
          }),
        { isolationLevel: 'Serializable', timeout: 15000 },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034', 'P2010'].includes(e.code)
      )
        throw new AccessError('CONFLICT');
      throw e;
    }
  }
}
