import type { Prisma, PrismaClient } from '@rental/database';
import type { AnalyticsQuery } from '@rental/validation';
import {
  assertTenantContext,
  type TenantContext,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type { AccessRepository } from '../access/contracts.js';
import {
  FinanceUnitOfWork,
  type FinanceReadRepository,
  type FinanceVisibility,
  type FinanceSnapshot,
} from '../analytics/contracts.js';
import { PrismaAccessRepository } from './prisma.repositories.js';

const iso = (d: Date | null) => d?.toISOString() ?? null;
const maxRows = 10000;
export class PrismaFinanceReader implements FinanceReadRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}
  async timezone(c: TenantContext) {
    assertTenantContext(c);
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: c.organizationId },
      select: { timezone: true },
    });
    return org.timezone;
  }
  async snapshot(
    c: TenantContext,
    q: AnalyticsQuery,
    v: FinanceVisibility,
  ): Promise<FinanceSnapshot> {
    assertTenantContext(c);
    const branch =
      c.branchScope === 'ALL_BRANCHES'
        ? {}
        : { branchId: { in: [...c.branchIds] } };
    if (
      q.branchId &&
      c.branchScope !== 'ALL_BRANCHES' &&
      !c.branchIds.includes(q.branchId)
    )
      throw new AccessError('ACCESS_DENIED');
    const machineWhere: Prisma.MachineWhereInput = {
      organizationId: c.organizationId,
      ...branch,
      ...(q.machineId ? { id: q.machineId } : {}),
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.modelId ? { modelId: q.modelId } : {}),
      ...(q.categoryId ? { model: { categoryId: q.categoryId } } : {}),
      ...(q.customerId
        ? {
            rentalAssignments: {
              some: {
                item: {
                  rental: {
                    organizationId: c.organizationId,
                    customerId: q.customerId,
                  },
                },
              },
            },
          }
        : {}),
    };
    const machines = await this.db.machine.findMany({
      where: machineWhere,
      take: maxRows + 1,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        fleetNumber: true,
        modelId: true,
        model: {
          select: {
            name: true,
            manufacturer: true,
            categoryId: true,
            category: { select: { name: true } },
          },
        },
        branchId: true,
        branch: { select: { name: true } },
        acquisitionDate: true,
        createdAt: true,
        lifecycleState: true,
        rentalState: true,
        serviceState: true,
        ...(v.acquisition ? { acquisitionCost: true, currency: true } : {}),
      },
    });
    if (q.machineId && !machines.length) throw new AccessError('NOT_FOUND');
    if (
      q.customerId &&
      !(await this.db.customer.findFirst({
        where: { organizationId: c.organizationId, id: q.customerId },
        select: { id: true },
      }))
    )
      throw new AccessError('NOT_FOUND');
    // Read a whole rental only if every historical machine is in branch scope, matching Rental's policy.
    const rentalScope: Prisma.RentalWhereInput = {
      organizationId: c.organizationId,
      ...branch,
      ...(q.branchId ? { branchId: q.branchId } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.status ? { status: q.status } : {}),
      AND: [
        ...(c.branchScope === 'ALL_BRANCHES'
          ? []
          : [
              {
                items: {
                  every: {
                    assignments: {
                      every: {
                        machine: { branchId: { in: [...c.branchIds] } },
                      },
                    },
                  },
                },
              },
            ]),
        ...(q.machineId || q.modelId || q.categoryId
          ? [
              {
                items: {
                  some: { assignments: { some: { machine: machineWhere } } },
                },
              },
            ]
          : []),
      ],
    };
    const rentals = v.rentals
      ? await this.db.rental.findMany({
          where: rentalScope,
          take: maxRows + 1,
          orderBy: { id: 'asc' },
          select: {
            id: true,
            number: true,
            status: true,
            customerId: true,
            customer: { select: { displayName: true } },
            branchId: true,
            items: {
              where: { removedAt: null },
              select: {
                id: true,
                quantity: true,
                plannedStartAt: true,
                plannedEndAt: true,
                ...(v.pricing
                  ? {
                      agreedRate: true,
                      rateUnit: true,
                      currency: true,
                      terms: {
                        orderBy: { plannedStartAt: 'asc' as const },
                        select: {
                          plannedStartAt: true,
                          plannedEndAt: true,
                          agreedRate: true,
                          rateUnit: true,
                          currency: true,
                        },
                      },
                    }
                  : {}),
                assignments: {
                  select: {
                    id: true,
                    machineId: true,
                    releasedAt: true,
                    actualStartAt: true,
                    actualEndAt: true,
                  },
                },
              },
            },
          },
        })
      : [];
    const orders = v.maintenance
      ? await this.db.workOrder.findMany({
          where: {
            organizationId: c.organizationId,
            ...branch,
            ...(q.branchId ? { branchId: q.branchId } : {}),
            machine: machineWhere,
          },
          take: maxRows + 1,
          select: {
            id: true,
            machineId: true,
            status: true,
            createdAt: true,
            completedAt: true,
            ...(v.costs
              ? {
                  costs: {
                    select: { kind: true, amount: true, currency: true },
                  },
                }
              : {}),
          },
        })
      : [];
    // Never silently return a partial aggregate. Callers narrow large reports by machine/branch/model.
    if ([machines, rentals, orders].some((rows) => rows.length > maxRows))
      throw new AccessError('INVALID_INPUT');
    return {
      machines: machines.map((m) => ({
        id: m.id,
        fleetNumber: m.fleetNumber,
        modelId: m.modelId,
        model: m.model.manufacturer + ' ' + m.model.name,
        categoryId: m.model.categoryId,
        category: m.model.category.name,
        branchId: m.branchId,
        branch: m.branch?.name ?? null,
        acquisitionDate: iso(m.acquisitionDate),
        createdAt: m.createdAt.toISOString(),
        lifecycleState: m.lifecycleState,
        rentalState: m.rentalState,
        serviceState: m.serviceState,
        ...(v.acquisition
          ? {
              acquisitionCost: m.acquisitionCost?.toFixed() ?? null,
              currency: m.currency,
            }
          : {}),
      })),
      rentals: rentals.map((r) => ({
        id: r.id,
        number: r.number,
        customerId: r.customerId,
        customer: v.customers ? r.customer.displayName : '',
        branchId: r.branchId,
        status: r.status,
        items: r.items.map((i) => ({
          id: i.id,
          quantity: i.quantity,
          plannedStartAt: iso(i.plannedStartAt),
          plannedEndAt: iso(i.plannedEndAt),
          ...(v.pricing
            ? {
                agreedRate: i.agreedRate?.toFixed() ?? null,
                rateUnit: i.rateUnit,
                currency: i.currency,
              }
            : {}),
          terms: v.pricing
            ? (i.terms ?? []).map((t) => ({
                ...t,
                agreedRate: t.agreedRate.toFixed(),
                plannedStartAt: t.plannedStartAt.toISOString(),
                plannedEndAt: t.plannedEndAt.toISOString(),
              }))
            : [],
          assignments: i.assignments.map((a) => ({
            ...a,
            releasedAt: iso(a.releasedAt),
            actualStartAt: iso(a.actualStartAt),
            actualEndAt: iso(a.actualEndAt),
          })),
        })),
      })),
      workOrders: orders.map((o) => ({
        id: o.id,
        machineId: o.machineId,
        status: o.status,
        occurredAt: (o.completedAt ?? o.createdAt).toISOString(),
        costs: v.costs
          ? (o.costs ?? []).map((cost) => ({
              ...cost,
              amount: cost.amount.toFixed(),
            }))
          : [],
      })),
    };
  }
}
export class PrismaFinanceUnitOfWork extends FinanceUnitOfWork {
  constructor(private readonly db: PrismaClient) {
    super();
  }
  override read<T>(
    work: (repositories: {
      access: AccessRepository;
      finance: FinanceReadRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      (tx) =>
        work({
          access: new PrismaAccessRepository(tx),
          finance: new PrismaFinanceReader(tx),
        }),
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }
}
