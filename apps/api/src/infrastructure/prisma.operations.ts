import type { Prisma, PrismaClient } from '@rental/database';
import {
  notificationPreferencesSchema,
  type OperationsQuery,
  type NotificationPreferences,
} from '@rental/validation';
import {
  AccessService,
  assertTenantContext,
  type TenantContext,
  type AuthenticatedPrincipal,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import {
  OperationsUnitOfWork,
  type OperationsReader,
  type OperationsSnapshot,
} from '../operations/contracts.js';
import { PrismaAccessRepository } from './prisma.repositories.js';
import { PrismaRentalRepository, rentalScope } from './prisma.rentals.js';
import { maintenanceScope } from './prisma.maintenance.js';
import { currentTelemetry } from '../devices/current-telemetry.js';
import { immediateCapacity } from '../rentals/immediate-capacity.js';

const maxRows = 10000;
function bounded<T>(rows: T[]): T[] {
  if (rows.length > maxRows) throw new AccessError('INVALID_INPUT');
  return rows;
}
function scope(c: TenantContext, q: OperationsQuery) {
  assertTenantContext(c);
  if (
    q.branchId &&
    c.branchScope !== 'ALL_BRANCHES' &&
    !c.branchIds.includes(q.branchId)
  )
    throw new AccessError('ACCESS_DENIED');
  return {
    organizationId: c.organizationId,
    ...(q.branchId
      ? { branchId: q.branchId }
      : c.branchScope === 'ALL_BRANCHES'
        ? {}
        : { branchId: { in: [...c.branchIds] } }),
  };
}
export class PrismaOperationsReader implements OperationsReader {
  constructor(private readonly db: Prisma.TransactionClient) {}
  async snapshot(
    c: TenantContext,
    q: OperationsQuery,
    now: Date,
  ): Promise<OperationsSnapshot> {
    const where = scope(c, q),
      can = (p: string) => c.permissions.includes(p);
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: c.organizationId },
      select: { timezone: true },
    });
    const branches = [
      'rentals.read',
      'machines.read',
      'maintenance.read',
      'telemetry.read',
    ].some(can)
      ? await this.db.branch.findMany({
          where: {
            organizationId: c.organizationId,
            ...(c.branchScope === 'ALL_BRANCHES'
              ? {}
              : { id: { in: [...c.branchIds] } }),
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const rentals = can('rentals.read')
      ? bounded(
          await this.db.rental.findMany({
            where: {
              ...rentalScope(c),
              ...where,
              status: { in: ['RESERVED', 'ACTIVE'] },
            },
            take: maxRows + 1,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              number: true,
              status: true,
              branchId: true,
              items: {
                where: { removedAt: null },
                select: {
                  id: true,
                  quantity: true,
                  plannedStartAt: true,
                  plannedEndAt: true,
                  assignments: {
                    where: { releasedAt: null },
                    select: {
                      machineId: true,
                      actualStartAt: true,
                      actualEndAt: true,
                    },
                  },
                },
              },
            },
          }),
        )
      : [];
    const machines =
      can('machines.read') || can('telemetry.read')
        ? bounded(
            await this.db.machine.findMany({
              where,
              take: maxRows + 1,
              orderBy: { id: 'asc' },
              select: {
                id: true,
                fleetNumber: true,
                branchId: true,
                lifecycleState: true,
                rentalState: true,
                serviceState: true,
                updatedAt: true,
                serviceRestrictions: {
                  where: { releasedAt: null },
                  select: { id: true, createdAt: true },
                  orderBy: { id: 'asc' },
                },
              },
            }),
          )
        : [];
    const orders = can('maintenance.read')
      ? bounded(
          await this.db.workOrder.findMany({
            where: {
              ...maintenanceScope(c),
              ...where,
              status: { notIn: ['COMPLETED', 'CANCELLED'] },
            },
            take: maxRows + 1,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              number: true,
              status: true,
              plannedAt: true,
              dueAt: true,
              startedAt: true,
              machine: { select: { fleetNumber: true } },
            },
          }),
        )
      : [];
    const plans = can('maintenance.read')
      ? bounded(
          await this.db.machineMaintenancePlan.findMany({
            where: {
              organizationId: c.organizationId,
              active: true,
              plan: { active: true },
              machine: where,
            },
            take: maxRows + 1,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              machineId: true,
              nextDueAt: true,
              plan: { select: { name: true } },
              machine: { select: { fleetNumber: true } },
            },
          }),
        )
      : [];
    const telemetry = can('telemetry.read')
      ? await currentTelemetry(
          this.db,
          c,
          machines.map((m) => m.id),
          now,
        )
      : new Map();
    let available: number | null = null;
    if (can('machines.read') && can('rentals.read')) {
      const reader = new PrismaRentalRepository(this.db);
      // Global capacity inputs stay inside Rental's matcher. Only visible units are counted.
      const all = bounded(await reader.machines(c)),
        commitments = bounded(await reader.commitments(c));
      available = immediateCapacity(
        all,
        commitments,
        new Set(machines.map((m) => m.id)),
        now,
      );
    }
    return {
      timezone: org.timezone,
      branches,
      rentals,
      machines,
      orders,
      plans,
      telemetry,
      available,
    };
  }
  async search(c: TenantContext, q: OperationsQuery & { q: string }) {
    const where = scope(c, q),
      can = (p: string) => c.permissions.includes(p),
      term = { contains: q.q, mode: 'insensitive' as const };
    const items: Awaited<ReturnType<OperationsReader['search']>>['items'] = [];
    let limited = false;
    const add = (
      source: (typeof items)[number]['source'],
      rows: { id: string; label: string }[],
      path: (id: string) => string,
    ) => {
      if (rows.length > 10) limited = true;
      for (const r of rows.slice(0, 10))
        items.push({
          source,
          ...r,
          href: `${path(r.id)}${path(r.id).includes('?') ? '&' : '?'}organizationId=${c.organizationId}`,
        });
    };
    if (can('customers.read'))
      add(
        'CUSTOMER',
        (
          await this.db.customer.findMany({
            where: { organizationId: c.organizationId, displayName: term },
            take: 11,
            orderBy: { id: 'asc' },
            select: { id: true, displayName: true },
          })
        ).map((r) => ({ id: r.id, label: r.displayName })),
        (id) => `/customers?customerId=${id}`,
      );
    if (can('machines.read'))
      add(
        'MACHINE',
        (
          await this.db.machine.findMany({
            where: {
              ...where,
              OR: [
                { fleetNumber: term },
                { serialNumber: term },
                { model: { name: term } },
                { model: { manufacturer: term } },
              ],
            },
            take: 11,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              fleetNumber: true,
              model: { select: { name: true } },
            },
          })
        ).map((r) => ({
          id: r.id,
          label: `${r.fleetNumber} · ${r.model.name}`,
        })),
        (id) => `/machines/${id}`,
      );
    if (can('rentals.read'))
      add(
        'RENTAL',
        (
          await this.db.rental.findMany({
            where: { ...rentalScope(c), ...where, number: term },
            take: 11,
            orderBy: { id: 'asc' },
            select: { id: true, number: true },
          })
        ).map((r) => ({ id: r.id, label: r.number })),
        (id) => `/rentals/${id}`,
      );
    if (can('maintenance.read'))
      add(
        'MAINTENANCE',
        (
          await this.db.workOrder.findMany({
            where: {
              ...maintenanceScope(c),
              ...where,
              OR: [{ number: term }, { machine: { fleetNumber: term } }],
            },
            take: 11,
            orderBy: { id: 'asc' },
            select: { id: true, number: true },
          })
        ).map((r) => ({ id: r.id, label: r.number })),
        (id) => `/maintenance/${id}`,
      );
    if (can('device.read'))
      add(
        'DEVICE',
        (
          await this.db.trackingDevice.findMany({
            where: {
              organizationId: c.organizationId,
              ...(q.branchId || c.branchScope !== 'ALL_BRANCHES'
                ? {
                    installations: {
                      some: { removedAt: null, machine: where },
                    },
                  }
                : {}),
              OR: [
                { providerDeviceId: term },
                { serialNumber: term },
                { deviceModel: term },
              ],
            },
            take: 11,
            orderBy: { id: 'asc' },
            select: { id: true, provider: true, providerDeviceId: true },
          })
        ).map((r) => ({
          id: r.id,
          label: `${r.provider} · ${r.providerDeviceId}`,
        })),
        (id) => `/devices?deviceId=${id}`,
      );
    return { items, limited };
  }
  async preferences(c: TenantContext) {
    assertTenantContext(c);
    const row = await this.db.notificationPreference.findUnique({
      where: {
        organizationId_membershipId: {
          organizationId: c.organizationId,
          membershipId: c.membershipId,
        },
      },
    });
    return notificationPreferencesSchema.parse(
      row
        ? {
            enabled: row.enabled,
            domains: row.domains,
            lowSocPercent: row.lowSocPercent,
          }
        : {},
    );
  }
  async savePreferences(c: TenantContext, value: NotificationPreferences) {
    assertTenantContext(c);
    const key = {
      organizationId: c.organizationId,
      membershipId: c.membershipId,
    };
    await this.db.notificationPreference.upsert({
      where: { organizationId_membershipId: key },
      create: { ...key, ...value },
      update: value,
    });
  }
  async interactions(c: TenantContext) {
    assertTenantContext(c);
    return (
      await this.db.notificationInteraction.findMany({
        where: {
          organizationId: c.organizationId,
          membershipId: c.membershipId,
        },
      })
    ).map((r) => ({
      key: r.key,
      readAt: r.readAt?.toISOString() ?? null,
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      dismissedAt: r.dismissedAt?.toISOString() ?? null,
    }));
  }
  async interact(
    c: TenantContext,
    key: string,
    action: 'READ' | 'UNREAD' | 'ACKNOWLEDGE' | 'DISMISS',
    now: Date,
  ) {
    assertTenantContext(c);
    const identity = {
      organizationId: c.organizationId,
      membershipId: c.membershipId,
      key,
    };
    const data =
      action === 'READ'
        ? { readAt: now }
        : action === 'UNREAD'
          ? { readAt: null }
          : action === 'ACKNOWLEDGE'
            ? { readAt: now, acknowledgedAt: now }
            : { readAt: now, dismissedAt: now };
    await this.db.notificationInteraction.upsert({
      where: { organizationId_membershipId_key: identity },
      create: { ...identity, ...data },
      update: data,
    });
  }
}
export class PrismaOperationsUnitOfWork extends OperationsUnitOfWork {
  constructor(private readonly db: PrismaClient) {
    super();
  }
  run<T>(
    p: AuthenticatedPrincipal,
    org: unknown,
    fn: (r: OperationsReader, c: TenantContext) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const c = await new AccessService(
          new PrismaAccessRepository(tx),
        ).tenant(p, org);
        return fn(new PrismaOperationsReader(tx), c);
      },
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }
}
