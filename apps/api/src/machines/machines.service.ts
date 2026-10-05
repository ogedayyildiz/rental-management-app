import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  errorCodeCatalog,
  errorEvents,
  gpsDevices,
  machineModels,
  machines,
  machineState,
  rentalContracts,
  rentalItems,
  tenantTelemetry,
  withTenant,
  type Database,
} from '@rental/db';
import {
  SIMULATOR_PROVIDER,
  type CreateMachineInput,
  type MachineListItem,
  type TelemetryHistoryPoint,
  type UpdateMachineInput,
} from '@rental/shared';
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { Transaction } from '@rental/db';
import { DB } from '../db/db.module.js';

const listColumns = {
  id: machines.id,
  name: machines.name,
  serialNo: machines.serialNo,
  status: machines.status,
  manufacturer: machineModels.manufacturer,
  model: machineModels.model,
  category: machineModels.category,
  lastSeenAt: machineState.lastSeenAt,
  location: machineState.location,
  batterySoc: machineState.batterySoc,
  engineHours: machineState.engineHours,
  ignition: machineState.ignition,
  activeErrorCodes: machineState.activeErrorCodes,
};

type ListRow = {
  [K in keyof typeof listColumns]: (typeof listColumns)[K]['_']['data'] | null;
};

function toListItem({ location, activeErrorCodes, ...row }: ListRow): MachineListItem {
  return {
    ...(row as Omit<MachineListItem, 'lat' | 'lon' | 'activeErrorCodes'>),
    lat: location?.lat ?? null,
    lon: location?.lon ?? null,
    activeErrorCodes: activeErrorCodes ?? [],
  };
}

@Injectable()
export class MachinesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(orgId: string): Promise<MachineListItem[]> {
    return withTenant(this.db, orgId, async (tx) => {
      const rows = await tx
        .select(listColumns)
        .from(machines)
        .innerJoin(machineModels, eq(machineModels.id, machines.modelId))
        .leftJoin(machineState, eq(machineState.machineId, machines.id))
        .orderBy(asc(machines.name));
      return rows.map(toListItem);
    });
  }

  get(orgId: string, id: string) {
    return withTenant(this.db, orgId, async (tx) => {
      const [row] = await tx
        .select({
          ...listColumns,
          modelId: machines.modelId,
          homeDepotId: machines.homeDepotId,
          year: machines.year,
          purchaseDate: machines.purchaseDate,
          purchasePrice: machines.purchasePrice,
          notes: machines.notes,
          speedKmh: machineState.speedKmh,
          heading: machineState.heading,
        })
        .from(machines)
        .innerJoin(machineModels, eq(machineModels.id, machines.modelId))
        .leftJoin(machineState, eq(machineState.machineId, machines.id))
        .where(eq(machines.id, id));
      if (!row) throw new NotFoundException('Machine not found');

      const [device] = await tx
        .select({ provider: gpsDevices.provider, externalId: gpsDevices.externalId })
        .from(gpsDevices)
        .where(and(eq(gpsDevices.machineId, id), eq(gpsDevices.active, true)));

      const [currentRental] = await tx
        .select({
          contractId: rentalContracts.id,
          contractNo: rentalContracts.contractNo,
          startAt: rentalItems.startAt,
          plannedEndDate: rentalContracts.plannedEndDate,
          customerId: rentalContracts.customerId,
        })
        .from(rentalItems)
        .innerJoin(rentalContracts, eq(rentalContracts.id, rentalItems.contractId))
        .where(
          and(
            eq(rentalItems.machineId, id),
            eq(rentalContracts.status, 'active'),
            isNull(rentalItems.cancelledAt),
          ),
        );

      // Money and reliability figures for the "how is this machine doing" panel.
      const [stats] = await tx
        .select({
          revenueEarned: sql<string>`coalesce((
            select sum(i.amount) from rental_items i
            join rental_contracts c on c.id = i.contract_id
            where i.machine_id = ${id} and i.cancelled_at is null
              and c.status in ('active', 'completed')), 0)`,
          maintenanceCost: sql<string>`coalesce((
            select sum(cost) from maintenance_records where machine_id = ${id}), 0)`,
          errors30d: sql<number>`(
            select count(*)::int from error_events
            where machine_id = ${id} and started_at > now() - interval '30 days')`,
          errors365d: sql<number>`(
            select count(*)::int from error_events
            where machine_id = ${id} and started_at > now() - interval '365 days')`,
        })
        .from(sql`(select 1) as _`);

      const { modelId, homeDepotId, year, purchaseDate, purchasePrice, notes, speedKmh, heading, ...base } = row;
      return {
        ...toListItem(base),
        modelId,
        homeDepotId,
        year,
        purchaseDate,
        purchasePrice,
        notes,
        speedKmh,
        heading,
        device: device ?? null,
        currentRental: currentRental ?? null,
        stats,
      };
    });
  }

  create(orgId: string, input: CreateMachineInput) {
    const { gpsDeviceId, gpsProvider, purchasePrice, ...fields } = input;
    return withTenant(this.db, orgId, async (tx) => {
      const [machine] = await tx
        .insert(machines)
        .values({ ...fields, organizationId: orgId, purchasePrice: purchasePrice?.toString() })
        .returning();
      if (gpsDeviceId) await this.linkDevice(tx, orgId, machine!.id, gpsDeviceId, gpsProvider);
      return machine!;
    });
  }

  update(orgId: string, id: string, input: UpdateMachineInput) {
    const { gpsDeviceId, gpsProvider, purchasePrice, status, ...fields } = input;
    return withTenant(this.db, orgId, async (tx) => {
      const [current] = await tx.select({ status: machines.status }).from(machines).where(eq(machines.id, id));
      if (!current) throw new NotFoundException('Machine not found');
      if (status && status !== current.status && current.status === 'rented') {
        throw new ConflictException('This machine is on an active rental. Complete the rental first.');
      }

      const [machine] = await tx
        .update(machines)
        .set({
          ...fields,
          ...(purchasePrice !== undefined && { purchasePrice: purchasePrice.toString() }),
          ...(status && { status }),
        })
        .where(eq(machines.id, id))
        .returning();

      if (gpsDeviceId !== undefined) await this.linkDevice(tx, orgId, id, gpsDeviceId, gpsProvider);
      return machine!;
    });
  }

  /**
   * Points the machine at a GPS device (an empty id unlinks it). A device id
   * already used by another machine fails on the global unique key.
   */
  private async linkDevice(tx: Transaction, orgId: string, machineId: string, externalId: string, provider?: string) {
    const deviceProvider = provider || process.env.DEFAULT_GPS_PROVIDER || SIMULATOR_PROVIDER;
    const [existing] = await tx
      .select({ id: gpsDevices.id, externalId: gpsDevices.externalId, provider: gpsDevices.provider })
      .from(gpsDevices)
      .where(and(eq(gpsDevices.machineId, machineId), eq(gpsDevices.active, true)));
    if (existing?.externalId === externalId && existing.provider === deviceProvider) return;

    if (existing) {
      await tx.update(gpsDevices).set({ active: false, machineId: null }).where(eq(gpsDevices.id, existing.id));
    }
    if (!externalId) return;

    // Re-use a device row this tenant registered before, unless another machine still has it.
    const [previous] = await tx
      .select({ id: gpsDevices.id, active: gpsDevices.active, machineName: machines.name })
      .from(gpsDevices)
      .leftJoin(machines, eq(machines.id, gpsDevices.machineId))
      .where(and(eq(gpsDevices.provider, deviceProvider), eq(gpsDevices.externalId, externalId)));
    if (previous?.active && previous.machineName) {
      throw new ConflictException(
        `GPS device ${externalId} is fitted to ${previous.machineName}. Remove it there first.`,
      );
    }
    if (previous) {
      await tx
        .update(gpsDevices)
        .set({ machineId, active: true, installedAt: new Date() })
        .where(eq(gpsDevices.id, previous.id));
    } else {
      await tx.insert(gpsDevices).values({
        organizationId: orgId,
        provider: deviceProvider,
        externalId,
        machineId,
        installedAt: new Date(),
      });
    }
  }

  /**
   * Every machine with whether it can be booked for [from, to] (inclusive
   * dates). A machine is unavailable when a confirmed booking overlaps or it is
   * out of service / retired. `excludeContractId` ignores an offer's own lines.
   */
  availability(orgId: string, from: string, to: string, excludeContractId?: string) {
    return withTenant(this.db, orgId, async (tx) => {
      const rows = await tx.execute<{
        id: string;
        name: string;
        serial_no: string;
        status: string;
        manufacturer: string;
        model: string;
        category: string;
        daily_rate: string | null;
        weekly_rate: string | null;
        monthly_rate: string | null;
        conflict_contract_no: string | null;
        conflict_start: string | null;
        conflict_end: string | null;
      }>(sql`
        select m.id, m.name, m.serial_no, m.status, mm.manufacturer, mm.model, mm.category,
               mm.daily_rate, mm.weekly_rate, mm.monthly_rate,
               c.contract_no as conflict_contract_no,
               c.start_date::text as conflict_start, c.planned_end_date::text as conflict_end
        from machines m
        join machine_models mm on mm.id = m.model_id
        left join lateral (
          select rc.contract_no, rc.start_date, rc.planned_end_date
          from rental_items i
          join rental_contracts rc on rc.id = i.contract_id
          where i.machine_id = m.id and i.confirmed and i.cancelled_at is null
            ${excludeContractId ? sql`and rc.id <> ${excludeContractId}` : sql``}
            and tstzrange(i.start_at, coalesce(i.end_at, 'infinity'::timestamptz))
                && tstzrange(${from}::date::timestamptz, (${to}::date + 1)::timestamptz)
          limit 1
        ) c on true
        where m.status <> 'retired'
        order by m.name
      `);
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        serialNo: r.serial_no,
        status: r.status,
        manufacturer: r.manufacturer,
        model: r.model,
        category: r.category,
        dailyRate: r.daily_rate,
        weeklyRate: r.weekly_rate,
        monthlyRate: r.monthly_rate,
        available: !r.conflict_contract_no && r.status !== 'out_of_service',
        conflict: r.conflict_contract_no
          ? { contractNo: r.conflict_contract_no, startDate: r.conflict_start, endDate: r.conflict_end }
          : null,
      }));
    });
  }

  telemetry(orgId: string, id: string, from: Date, to: Date, limit: number): Promise<TelemetryHistoryPoint[]> {
    return withTenant(this.db, orgId, async (tx) => {
      const rows = await tx
        .select({
          time: tenantTelemetry.time,
          location: tenantTelemetry.location,
          speedKmh: tenantTelemetry.speedKmh,
          batterySoc: tenantTelemetry.batterySoc,
          engineHours: tenantTelemetry.engineHours,
          ignition: tenantTelemetry.ignition,
        })
        .from(tenantTelemetry)
        .where(
          and(
            eq(tenantTelemetry.machineId, id),
            gte(tenantTelemetry.time, from),
            lte(tenantTelemetry.time, to),
          ),
        )
        .orderBy(desc(tenantTelemetry.time))
        .limit(limit);
      return rows.reverse().map(({ location, ...r }) => ({
        ...r,
        lat: location?.lat ?? null,
        lon: location?.lon ?? null,
      }));
    });
  }

  errors(orgId: string, id: string) {
    return withTenant(this.db, orgId, (tx) =>
      tx
        .select({
          id: errorEvents.id,
          code: errorEvents.code,
          severity: errorEvents.severity,
          description: errorCodeCatalog.description,
          startedAt: errorEvents.startedAt,
          clearedAt: errorEvents.clearedAt,
          acknowledgedAt: errorEvents.acknowledgedAt,
        })
        .from(errorEvents)
        .leftJoin(
          errorCodeCatalog,
          and(
            eq(errorCodeCatalog.organizationId, errorEvents.organizationId),
            eq(errorCodeCatalog.code, errorEvents.code),
          ),
        )
        .where(eq(errorEvents.machineId, id))
        .orderBy(desc(errorEvents.startedAt))
        .limit(200),
    );
  }
}
