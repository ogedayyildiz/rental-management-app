import { currentTelemetry } from './current-telemetry.js';
import { Prisma, type PrismaClient } from '@rental/database';
import {
  devicePatch,
  deviceCreate,
  deviceAssignment,
  identifierSchema,
  historyQuery,
} from '@rental/validation';
import type { TenantPermission } from '@rental/permissions';
import {
  AccessService,
  requirePermission,
  type AuthenticatedPrincipal,
  type TenantContext,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import {
  PrismaAccessRepository,
  PrismaAuditRepository,
} from '../infrastructure/prisma.repositories.js';
import { AuditService, type AuditRecord } from '../audit/audit.service.js';
type Tx = Prisma.TransactionClient;
type Actor = { principal: AuthenticatedPrincipal; requestId: string };
function parse<T>(
  s: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  v: unknown,
) {
  const r = s.safeParse(v);
  if (!r.success) throw new AccessError('INVALID_INPUT');
  return r.data;
}
function metadata(v: ReturnType<typeof devicePatch.parse>) {
  return {
    ...(v.priorities === undefined ? {} : { priorities: v.priorities }),
    ...(v.serialNumber === undefined ? {} : { serialNumber: v.serialNumber }),
    ...(v.deviceModel === undefined ? {} : { deviceModel: v.deviceModel }),
  };
}
function branch(c: TenantContext) {
  return c.branchScope === 'ALL_BRANCHES'
    ? {}
    : { branchId: { in: [...c.branchIds] } };
}
function visible(c: TenantContext) {
  return {
    organizationId: c.organizationId,
    ...(c.branchScope === 'ALL_BRANCHES'
      ? {}
      : { installations: { some: { removedAt: null, machine: branch(c) } } }),
  };
}
export class DeviceService {
  constructor(private db: PrismaClient) {}
  private async run<T>(
    a: Actor,
    org: string,
    p: TenantPermission,
    fn: (tx: Tx, c: TenantContext) => Promise<T>,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          const c = await new AccessService(
            new PrismaAccessRepository(tx),
          ).tenant(a.principal, org);
          requirePermission(c, p);
          return fn(tx, c);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034', 'P2004'].includes(e.code)
      )
        throw new AccessError('CONFLICT');
      throw e;
    }
  }
  private async audit(
    tx: Tx,
    c: TenantContext,
    a: Actor,
    action: AuditRecord['action'],
    target: AuditRecord['targetType'],
    id: string,
  ) {
    await new AuditService(new PrismaAuditRepository(tx)).customerMutation(
      c,
      a.requestId,
      action,
      target,
      id,
    );
  }
  list(a: Actor, o: string, cursor?: string) {
    return this.run(a, o, 'device.read', (tx, c) =>
      tx.trackingDevice.findMany({
        where: {
          ...visible(c),
          ...(cursor ? { id: { gt: parse(identifierSchema, cursor) } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 100,
      }),
    );
  }
  detail(a: Actor, o: string, id: string) {
    return this.run(a, o, 'device.read', async (tx, c) => {
      const row = await tx.trackingDevice.findFirst({
        where: { ...visible(c), id: parse(identifierSchema, id) },
        include: {
          installations: {
            where: { machine: branch(c) },
            orderBy: { installedAt: 'desc' },
            include: { machine: { select: { fleetNumber: true } } },
          },
        },
      });
      if (!row) throw new AccessError('NOT_FOUND');
      return row;
    });
  }
  save(a: Actor, o: string, id: string | null, body: unknown) {
    return this.run(a, o, 'device.manage', async (tx, c) => {
      let row;
      if (id) {
        if (
          !(await tx.trackingDevice.findFirst({
            where: { ...visible(c), id: parse(identifierSchema, id) },
          }))
        )
          throw new AccessError('NOT_FOUND');
        row = await tx.trackingDevice.update({
          where: { organizationId_id: { organizationId: o, id } },
          data: metadata(parse(devicePatch, body)),
        });
      } else {
        if (c.branchScope !== 'ALL_BRANCHES')
          throw new AccessError('ACCESS_DENIED');
        const input = parse(deviceCreate, body);
        row = await tx.trackingDevice.create({
          data: {
            organizationId: o,
            provider: input.provider,
            providerDeviceId: input.providerDeviceId,
            ...metadata(input),
          },
        });
      }
      await this.audit(
        tx,
        c,
        a,
        id ? 'DEVICE_UPDATED' : 'DEVICE_REGISTERED',
        'TrackingDevice',
        row.id,
      );
      return row;
    });
  }
  transition(
    a: Actor,
    o: string,
    id: string,
    action: 'install' | 'move' | 'remove',
    body: unknown,
  ) {
    return this.run(
      a,
      o,
      action === 'remove' ? 'device.remove' : 'device.assign',
      async (tx, c) => {
        if (action === 'move') requirePermission(c, 'device.remove');
        parse(identifierSchema, id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`;
        const row = await tx.trackingDevice.findFirst({
          where: { ...visible(c), id },
          include: { installations: { where: { removedAt: null } } },
        });
        if (!row) throw new AccessError('NOT_FOUND');
        const current = row.installations[0];
        if ((action === 'install') === !!current)
          throw new AccessError('CONFLICT');
        const machineId =
          action === 'remove' ? null : parse(deviceAssignment, body).machineId;
        if (machineId === current?.machineId) throw new AccessError('CONFLICT');
        if (
          machineId &&
          !(await tx.machine.findFirst({
            where: { organizationId: o, id: machineId, ...branch(c) },
          }))
        )
          throw new AccessError('NOT_FOUND');
        const at = new Date();
        if (current) {
          if (at <= current.installedAt) throw new AccessError('CONFLICT');
          await tx.deviceInstallation.update({
            where: { id: current.id },
            data: { removedAt: at },
          });
          await this.audit(
            tx,
            c,
            a,
            'DEVICE_REMOVED',
            'DeviceInstallation',
            current.id,
          );
        }
        if (machineId) {
          const add = await tx.deviceInstallation.create({
            data: {
              organizationId: o,
              machineId,
              trackingDeviceId: id,
              installedAt: at,
            },
          });
          await this.audit(
            tx,
            c,
            a,
            'DEVICE_INSTALLED',
            'DeviceInstallation',
            add.id,
          );
        }
        return { id };
      },
    );
  }
  machine(a: Actor, o: string, id: string, q?: unknown) {
    return this.run(a, o, 'telemetry.read', async (tx, c) => {
      if (
        !(await tx.machine.findFirst({
          where: {
            organizationId: o,
            id: parse(identifierSchema, id),
            ...branch(c),
          },
        }))
      )
        throw new AccessError('NOT_FOUND');
      if (q !== undefined) {
        const f = parse(historyQuery, q);
        return tx.$queryRaw`SELECT signal,value,device,recorded,received,quality,healthy FROM telemetry_measurement WHERE org=${o}::uuid AND machine=${id}::uuid AND recorded>=${new Date(f.from)} AND recorded<${new Date(f.to)} AND signal IN (${Prisma.join(f.signals)}) ORDER BY recorded DESC,event,signal LIMIT ${f.limit}`;
      }
      const state = (await currentTelemetry(tx, c, [id])).get(id)!;
      return {
        connectivity: state.connectivity,
        lastUpdate: state.lastUpdate,
        signals: state.signals,
        faults: state.faults,
      };
    });
  }
}
