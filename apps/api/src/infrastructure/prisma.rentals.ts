import { Prisma } from '@rental/database';
import type { PrismaClient } from '@rental/database';
import {
  rentalViewSchema,
  machineSpecificationsSchema,
} from '@rental/validation';
import type {
  RentalInput,
  RentalPatch,
  RentalItemInput,
  RentalSearch,
  RentalStatus,
  RentalRateUnit,
} from '@rental/validation';
import { assertTenantContext } from '../access/access.service.js';
import type { TenantContext } from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import { RentalUnitOfWork } from '../rentals/contracts.js';
import type {
  RentalRepository,
  RentalRepositories,
} from '../rentals/contracts.js';
import {
  PrismaAccessRepository,
  PrismaAuditRepository,
} from './prisma.repositories.js';
import { PrismaMachineRentalStateWriter } from './prisma.machine-rental-state.js';
const include = {
  customer: { select: { displayName: true } },
  branch: { select: { name: true } },
  organization: { select: { timezone: true } },
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      assignments: {
        orderBy: { assignedAt: 'asc' as const },
        include: { machine: { include: { model: true } } },
      },
      terms: { orderBy: { agreedAt: 'asc' as const } },
    },
  },
} as const;
type Row = Prisma.RentalGetPayload<{ include: typeof include }>;
const iso = (date: Date | null) => date?.toISOString() ?? null;
function view(row: Row) {
  return rentalViewSchema.parse({
    ...row,
    customerName: row.customer.displayName,
    branchName: row.branch?.name ?? null,
    timezone: row.organization.timezone,
    plannedStartAt: iso(row.plannedStartAt),
    plannedEndAt: iso(row.plannedEndAt),
    actualStartAt: iso(row.actualStartAt),
    actualEndAt: iso(row.actualEndAt),
    cancelledAt: iso(row.cancelledAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    items: row.items.map((item) => ({
      ...item,
      plannedStartAt: iso(item.plannedStartAt),
      plannedEndAt: iso(item.plannedEndAt),
      agreedRate: item.agreedRate?.toFixed() ?? null,
      removedAt: iso(item.removedAt),
      assignments: item.assignments.map((a) => ({
        ...a,
        fleetNumber: a.machine.fleetNumber,
        manufacturer: a.machine.model.manufacturer,
        model: a.machine.model.name,
        assignedAt: iso(a.assignedAt),
        releasedAt: iso(a.releasedAt),
        actualStartAt: iso(a.actualStartAt),
        actualEndAt: iso(a.actualEndAt),
      })),
      terms: item.terms.map((t) => ({
        ...t,
        agreedRate: t.agreedRate.toFixed(),
        plannedStartAt: iso(t.plannedStartAt),
        plannedEndAt: iso(t.plannedEndAt),
        agreedAt: iso(t.agreedAt),
      })),
    })),
  });
}
export class PrismaRentalRepository implements RentalRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}
  private scope(c: TenantContext): Prisma.RentalWhereInput {
    assertTenantContext(c);
    return {
      organizationId: c.organizationId,
      ...(c.branchScope === 'ALL_BRANCHES'
        ? {}
        : {
            branchId: { in: [...c.branchIds] },
            items: {
              every: {
                assignments: {
                  every: { machine: { branchId: { in: [...c.branchIds] } } },
                },
              },
            },
          }),
    };
  }
  async lock(organizationId: string) {
    // Updating the row version serializes scheduling writes, including initially empty capacity pools.
    // A waiting Serializable transaction retries through a safe 409 rather than reading a stale schedule.
    await this.db
      .$executeRaw`UPDATE "Organization" SET name=name WHERE id=${organizationId}::uuid`;
  }
  async catalog(c: TenantContext) {
    assertTenantContext(c);
    const categories = await this.db.machineCategory.findMany({
      where: { organizationId: c.organizationId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const models = await this.db.machineModel.findMany({
      where: { organizationId: c.organizationId },
      select: {
        id: true,
        name: true,
        manufacturer: true,
        categoryId: true,
        machines: {
          where: {
            organizationId: c.organizationId,
            lifecycleState: 'ACTIVE',
            ...(c.branchScope === 'ALL_BRANCHES'
              ? {}
              : { branchId: { in: [...c.branchIds] } }),
          },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });
    const branches = await this.db.branch.findMany({
      where: {
        organizationId: c.organizationId,
        active: true,
        ...(c.branchScope === 'ALL_BRANCHES'
          ? {}
          : { id: { in: [...c.branchIds] } }),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: c.organizationId },
      select: { timezone: true },
    });
    return {
      categories,
      models: models.map(({ machines, ...model }) => ({
        ...model,
        availableForRental: machines.length > 0,
      })),
      branches,
      timezone: org.timezone,
    };
  }
  async list(c: TenantContext, q: RentalSearch) {
    const [time, id] = q.cursor?.split('|') ?? [];
    const and: Prisma.RentalWhereInput[] = [];
    if (q.branchId) and.push({ branchId: q.branchId });
    if (q.machineId)
      and.push({
        items: { some: { assignments: { some: { machineId: q.machineId } } } },
      });
    if (q.current === 'true')
      and.push({ status: { in: ['RESERVED', 'ACTIVE'] } });
    if (q.current === 'false')
      and.push({ status: { notIn: ['RESERVED', 'ACTIVE'] } });
    if (time && id)
      and.push({
        OR: [
          { createdAt: { lt: new Date(time) } },
          { createdAt: new Date(time), id: { lt: id } },
        ],
      });
    if (q.plannedFrom)
      and.push({ plannedEndAt: { gt: new Date(q.plannedFrom) } });
    if (q.plannedTo)
      and.push({ plannedStartAt: { lt: new Date(q.plannedTo) } });
    if (q.actualFrom)
      and.push({
        actualStartAt: { not: null },
        OR: [
          { actualEndAt: null },
          { actualEndAt: { gte: new Date(q.actualFrom) } },
        ],
      });
    if (q.actualTo) and.push({ actualStartAt: { lte: new Date(q.actualTo) } });
    if (q.q) {
      const contains = { contains: q.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { number: contains },
          { customer: { displayName: contains } },
          {
            items: {
              some: {
                assignments: {
                  some: {
                    machine: {
                      OR: [
                        { fleetNumber: contains },
                        { serialNumber: contains },
                      ],
                    },
                  },
                },
              },
            },
          },
        ],
      });
    }
    const rows = await this.db.rental.findMany({
      where: {
        ...this.scope(c),
        ...(q.customerId ? { customerId: q.customerId } : {}),
        ...(q.status ? { status: q.status } : {}),
        AND: and,
      },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const items = rows.slice(0, q.limit).map(view),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > q.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  async find(c: TenantContext, id: string) {
    const row = await this.db.rental.findFirst({
      where: { ...this.scope(c), id },
      include,
    });
    return row ? view(row) : null;
  }
  async commitments(c: TenantContext) {
    assertTenantContext(c);
    return (
      await this.db.rental.findMany({
        where: {
          organizationId: c.organizationId,
          status: { in: ['RESERVED', 'ACTIVE'] },
        },
        include,
      })
    ).map(view);
  }
  async machines(c: TenantContext) {
    assertTenantContext(c);
    return (
      await this.db.machine.findMany({
        where: { organizationId: c.organizationId },
        include: { model: { include: { category: true } } },
      })
    ).map((m) => ({
      id: m.id,
      fleetNumber: m.fleetNumber,
      manufacturer: m.model.manufacturer,
      model: m.model.name,
      category: m.model.category.name,
      categoryId: m.model.categoryId,
      modelId: m.modelId,
      branchId: m.branchId,
      lifecycleState: m.lifecycleState,
      serviceState: m.serviceState,
      specifications: machineSpecificationsSchema.parse(m.specifications),
      createdAt: m.createdAt.toISOString(),
    }));
  }
  async hasActualConflict(
    c: TenantContext,
    machineId: string,
    start: string,
    excludeId?: string,
  ) {
    assertTenantContext(c);
    return Boolean(
      await this.db.rentalMachineAssignment.findFirst({
        where: {
          organizationId: c.organizationId,
          machineId,
          ...(excludeId ? { id: { not: excludeId } } : {}),
          actualStartAt: { not: null },
          OR: [{ actualEndAt: null }, { actualEndAt: { gt: new Date(start) } }],
        },
        select: { id: true },
      }),
    );
  }
  async requireCustomer(c: TenantContext, id: string) {
    assertTenantContext(c);
    if (
      !(await this.db.customer.findFirst({
        where: { organizationId: c.organizationId, id, active: true },
        select: { id: true },
      }))
    )
      throw new AccessError('NOT_FOUND');
  }
  async create(c: TenantContext, input: RentalInput) {
    assertTenantContext(c);
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: c.organizationId },
      select: { timezone: true },
    });
    const year = Number(
      new Intl.DateTimeFormat('en', {
        year: 'numeric',
        timeZone: org.timezone,
      }).format(new Date()),
    );
    const counter = await this.db.rentalCounter.upsert({
      where: {
        organizationId_year: { organizationId: c.organizationId, year },
      },
      create: { organizationId: c.organizationId, year, value: 1 },
      update: { value: { increment: 1 } },
    });
    const row = await this.db.rental.create({
      data: {
        organizationId: c.organizationId,
        customerId: input.customerId,
        branchId: input.branchId,
        notes: input.notes,
        number: `R-${year}-${String(counter.value).padStart(6, '0')}`,
        createdById: c.userId,
        updatedById: c.userId,
      },
      include,
    });
    await this.addItems(c, row.id, input.items);
    await this.refreshDates(c, row.id);
    return (await this.find(c, row.id))!;
  }
  async edit(c: TenantContext, id: string, input: RentalPatch) {
    const { items, ...data } = input;
    const result = await this.db.rental.updateMany({
      where: { ...this.scope(c), id },
      data: {
        ...(data.customerId !== undefined
          ? { customerId: data.customerId }
          : {}),
        ...(data.branchId !== undefined ? { branchId: data.branchId } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        updatedById: c.userId,
      },
    });
    if (result.count !== 1) throw new AccessError('NOT_FOUND');
    if (items) {
      const old = await this.db.rentalItem.findMany({
        where: {
          organizationId: c.organizationId,
          rentalId: id,
          removedAt: null,
        },
        select: { id: true },
      });
      await this.db.rentalMachineAssignment.updateMany({
        where: {
          organizationId: c.organizationId,
          itemId: { in: old.map((i) => i.id) },
          releasedAt: null,
        },
        data: { releasedAt: new Date(), reason: 'DRAFT_REVISION' },
      });
      await this.db.rentalItem.updateMany({
        where: {
          organizationId: c.organizationId,
          rentalId: id,
          removedAt: null,
        },
        data: { removedAt: new Date() },
      });
      await this.addItems(c, id, items);
    }
    await this.refreshDates(c, id);
  }
  async addItems(c: TenantContext, id: string, items: RentalItemInput[]) {
    assertTenantContext(c);
    for (const i of items) {
      const { machineIds, plannedStartAt, plannedEndAt, agreedRate, ...rest } =
        i;
      const row = await this.db.rentalItem.create({
        data: {
          ...rest,
          rateUnit: i.rateUnit ?? null,
          currency: i.currency ?? null,
          commercialNotes: i.commercialNotes ?? null,
          organizationId: c.organizationId,
          rentalId: id,
          plannedStartAt: plannedStartAt ? new Date(plannedStartAt) : null,
          plannedEndAt: plannedEndAt ? new Date(plannedEndAt) : null,
          agreedRate:
            agreedRate == null ? null : new Prisma.Decimal(agreedRate),
        },
      });
      for (const machine of machineIds) await this.assign(c, row.id, machine);
    }
  }
  async setStatus(
    c: TenantContext,
    id: string,
    status: RentalStatus,
    extra: {
      actualStartAt?: string;
      actualEndAt?: string;
      cancelledAt?: string;
      cancellationReason?: string;
    } = {},
  ) {
    const result = await this.db.rental.updateMany({
      where: { ...this.scope(c), id },
      data: { status, ...extra, updatedById: c.userId },
    });
    if (result.count !== 1) throw new AccessError('NOT_FOUND');
  }
  async assign(c: TenantContext, itemId: string, machineId: string) {
    assertTenantContext(c);
    await this.db.rentalMachineAssignment.create({
      data: { organizationId: c.organizationId, itemId, machineId },
    });
  }
  async release(c: TenantContext, id: string, reason: string, time: string) {
    assertTenantContext(c);
    await this.db.rentalMachineAssignment.updateMany({
      where: { organizationId: c.organizationId, id },
      data: { releasedAt: new Date(time), reason },
    });
  }
  async start(c: TenantContext, id: string, time: string) {
    assertTenantContext(c);
    await this.db.rentalMachineAssignment.updateMany({
      where: { organizationId: c.organizationId, id, actualStartAt: null },
      data: { actualStartAt: new Date(time) },
    });
  }
  async end(c: TenantContext, id: string, time: string) {
    assertTenantContext(c);
    await this.db.rentalMachineAssignment.updateMany({
      where: {
        organizationId: c.organizationId,
        id,
        actualStartAt: { not: null },
        actualEndAt: null,
      },
      data: { actualEndAt: new Date(time) },
    });
  }
  async extend(c: TenantContext, itemId: string, end: string) {
    assertTenantContext(c);
    await this.db.rentalItem.updateMany({
      where: { organizationId: c.organizationId, id: itemId },
      data: { plannedEndAt: new Date(end) },
    });
  }
  async term(
    c: TenantContext,
    itemId: string,
    input: {
      plannedStartAt: string;
      plannedEndAt: string;
      agreedRate: string;
      rateUnit: RentalRateUnit;
      currency: string;
    },
  ) {
    assertTenantContext(c);
    await this.db.rentalItemTerm.create({
      data: {
        ...input,
        organizationId: c.organizationId,
        itemId,
        actorUserId: c.userId,
        agreedRate: new Prisma.Decimal(input.agreedRate),
      },
    });
  }
  async refreshDates(c: TenantContext, id: string) {
    assertTenantContext(c);
    const items = await this.db.rentalItem.findMany({
      where: {
        organizationId: c.organizationId,
        rentalId: id,
        removedAt: null,
      },
      select: { plannedStartAt: true, plannedEndAt: true },
    });
    const starts = items.flatMap((i) =>
        i.plannedStartAt ? [i.plannedStartAt.getTime()] : [],
      ),
      ends = items.flatMap((i) =>
        i.plannedEndAt ? [i.plannedEndAt.getTime()] : [],
      );
    await this.db.rental.updateMany({
      where: { organizationId: c.organizationId, id },
      data: {
        plannedStartAt: starts.length ? new Date(Math.min(...starts)) : null,
        plannedEndAt: ends.length ? new Date(Math.max(...ends)) : null,
        updatedById: c.userId,
      },
    });
  }
}
export class PrismaRentalUnitOfWork extends RentalUnitOfWork {
  constructor(private readonly db: PrismaClient) {
    super();
  }
  override async run<T>(
    work: (r: RentalRepositories) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        (tx) =>
          work({
            access: new PrismaAccessRepository(tx),
            rentals: new PrismaRentalRepository(tx),
            machines: new PrismaMachineRentalStateWriter(tx),
            audit: new PrismaAuditRepository(tx),
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
