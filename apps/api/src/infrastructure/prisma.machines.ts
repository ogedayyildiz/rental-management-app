import { Prisma } from '@rental/database';
import type { PrismaClient } from '@rental/database';
import { machineViewSchema } from '@rental/validation';
import type { MachineInput, MachineSearch } from '@rental/validation';
import { assertTenantContext } from '../access/access.service.js';
import type { TenantContext } from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import { MachineUnitOfWork } from '../machines/contracts.js';
import type {
  MachineRepository,
  MachineRepositories,
} from '../machines/contracts.js';
import {
  PrismaAccessRepository,
  PrismaAuditRepository,
} from './prisma.repositories.js';
const include = {
  model: { include: { category: true } },
  branch: { select: { name: true } },
} as const;
type Row = Prisma.MachineGetPayload<{ include: typeof include }>;
function view(row: Row) {
  return machineViewSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    fleetNumber: row.fleetNumber,
    modelId: row.modelId,
    categoryId: row.model.categoryId,
    manufacturer: row.model.manufacturer,
    model: row.model.name,
    category: row.model.category.name,
    serialNumber: row.serialNumber,
    modelYear: row.modelYear,
    acquisitionDate: row.acquisitionDate?.toISOString().slice(0, 10) ?? null,
    acquisitionCost: row.acquisitionCost?.toFixed() ?? null,
    currency: row.currency,
    ownershipType: row.ownershipType,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    notes: row.notes,
    specifications: row.specifications,
    rentalState: row.rentalState,
    serviceState: row.serviceState,
    lifecycleState: row.lifecycleState,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdById: row.createdById,
    updatedById: row.updatedById,
  });
}
const key = (s: string) => s.trim().normalize('NFKC').toUpperCase();
export class PrismaMachineRepository implements MachineRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}
  private scope(c: TenantContext): Prisma.MachineWhereInput {
    assertTenantContext(c);
    return {
      organizationId: c.organizationId,
      ...(c.branchScope === 'ALL_BRANCHES'
        ? {}
        : { branchId: { in: [...c.branchIds] } }),
    };
  }
  async branches(c: TenantContext) {
    assertTenantContext(c);
    return this.db.branch.findMany({
      where: {
        organizationId: c.organizationId,
        active: true,
        ...(c.branchScope === 'ALL_BRANCHES'
          ? {}
          : { id: { in: [...c.branchIds] } }),
      },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
  async requireBranch(c: TenantContext, id: string | null) {
    assertTenantContext(c);
    if (id === null) {
      if (c.branchScope !== 'ALL_BRANCHES')
        throw new AccessError('ACCESS_DENIED');
      return;
    }
    if (c.branchScope !== 'ALL_BRANCHES' && !c.branchIds.includes(id))
      throw new AccessError('ACCESS_DENIED');
    if (
      !(await this.db.branch.findFirst({
        where: { organizationId: c.organizationId, id, active: true },
        select: { id: true },
      }))
    )
      throw new AccessError('NOT_FOUND');
  }
  async list(c: TenantContext, q: MachineSearch) {
    const contains = (s: string) => ({
      contains: s,
      mode: 'insensitive' as const,
    });
    const [time, id] = q.cursor?.split('|') ?? [];
    const rows = await this.db.machine.findMany({
      where: {
        ...this.scope(c),
        ...(q.branchId
          ? {
              AND: [
                { branchId: q.branchId },
                ...(time && id
                  ? [
                      {
                        OR: [
                          { createdAt: { lt: new Date(time) } },
                          { createdAt: new Date(time), id: { lt: id } },
                        ],
                      },
                    ]
                  : []),
              ],
            }
          : time && id
            ? {
                AND: [
                  {
                    OR: [
                      { createdAt: { lt: new Date(time) } },
                      { createdAt: new Date(time), id: { lt: id } },
                    ],
                  },
                ],
              }
            : {}),
        ...(q.lifecycleState === 'ALL'
          ? {}
          : { lifecycleState: q.lifecycleState }),
        ...(q.rentalState ? { rentalState: q.rentalState } : {}),
        ...(q.serviceState ? { serviceState: q.serviceState } : {}),
        ...(q.fleetNumber ? { fleetNumber: contains(q.fleetNumber) } : {}),
        ...(q.serialNumber ? { serialNumber: contains(q.serialNumber) } : {}),
        model: {
          ...(q.manufacturer ? { manufacturer: contains(q.manufacturer) } : {}),
          ...(q.model ? { name: contains(q.model) } : {}),
          ...(q.category ? { category: { name: contains(q.category) } } : {}),
        },
        ...(q.q
          ? {
              OR: [
                { fleetNumber: contains(q.q) },
                { serialNumber: contains(q.q) },
                { model: { manufacturer: contains(q.q) } },
                { model: { name: contains(q.q) } },
                { model: { category: { name: contains(q.q) } } },
              ],
            }
          : {}),
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
    const row = await this.db.machine.findFirst({
      where: { ...this.scope(c), id },
      include,
    });
    return row ? view(row) : null;
  }
  async save(c: TenantContext, id: string | null, input: MachineInput) {
    assertTenantContext(c);
    const category = await this.db.machineCategory.upsert({
      where: {
        organizationId_key: {
          organizationId: c.organizationId,
          key: key(input.category),
        },
      },
      create: {
        organizationId: c.organizationId,
        name: input.category,
        key: key(input.category),
      },
      update: {},
    });
    const identity = {
      organizationId: c.organizationId,
      categoryId: category.id,
      manufacturerKey: key(input.manufacturer),
      nameKey: key(input.model),
    };
    const model = await this.db.machineModel.upsert({
      where: { organizationId_categoryId_manufacturerKey_nameKey: identity },
      create: {
        ...identity,
        manufacturer: input.manufacturer,
        name: input.model,
      },
      update: {},
    });
    const {
      manufacturer: _manufacturer,
      model: _model,
      category: _category,
      acquisitionDate,
      acquisitionCost,
      ...rest
    } = input;
    void _manufacturer;
    void _model;
    void _category;
    const data = {
      ...rest,
      modelId: model.id,
      fleetNumberKey: key(input.fleetNumber),
      acquisitionDate: acquisitionDate
        ? new Date(`${acquisitionDate}T00:00:00.000Z`)
        : null,
      acquisitionCost:
        acquisitionCost === null ? null : new Prisma.Decimal(acquisitionCost),
      updatedById: c.userId,
    };
    if (!id)
      return view(
        await this.db.machine.create({
          data: {
            ...data,
            organizationId: c.organizationId,
            createdById: c.userId,
          },
          include,
        }),
      );
    const result = await this.db.machine.updateMany({
      where: { ...this.scope(c), id, lifecycleState: 'ACTIVE' },
      data,
    });
    if (result.count !== 1) throw new AccessError('CONFLICT');
    const row = await this.find(c, id);
    if (!row) throw new AccessError('CONFLICT');
    return row;
  }
  async archive(c: TenantContext, id: string, state: 'SOLD' | 'RETIRED') {
    const result = await this.db.machine.updateMany({
      where: {
        ...this.scope(c),
        id,
        lifecycleState: 'ACTIVE',
        rentalState: 'NOT_RENTED',
      },
      data: { lifecycleState: state, updatedById: c.userId },
    });
    if (result.count !== 1) throw new AccessError('CONFLICT');
    const row = await this.find(c, id);
    if (!row) throw new AccessError('CONFLICT');
    return row;
  }
}
export class PrismaMachineUnitOfWork extends MachineUnitOfWork {
  constructor(private readonly db: PrismaClient) {
    super();
  }
  override async run<T>(
    work: (r: MachineRepositories) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        (tx) =>
          work({
            access: new PrismaAccessRepository(tx),
            machines: new PrismaMachineRepository(tx),
            audit: new PrismaAuditRepository(tx),
          }),
        { isolationLevel: 'Serializable' },
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
