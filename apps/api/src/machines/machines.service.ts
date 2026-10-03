import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
import type { CreateMachineInput, MachineListItem, TelemetryHistoryPoint } from '@rental/shared';
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
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
          and(eq(rentalItems.machineId, id), isNull(rentalItems.endAt), isNull(rentalItems.cancelledAt)),
        );

      // Money and reliability figures for the "how is this machine doing" panel.
      const [stats] = await tx
        .select({
          revenueEarned: sql<string>`coalesce((
            select sum(amount) from rental_items
            where machine_id = ${id} and cancelled_at is null), 0)`,
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

      const { year, purchaseDate, purchasePrice, notes, speedKmh, heading, ...base } = row;
      return {
        ...toListItem(base),
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
    return withTenant(this.db, orgId, async (tx) => {
      const [machine] = await tx
        .insert(machines)
        .values({
          ...input,
          organizationId: orgId,
          purchasePrice: input.purchasePrice?.toString(),
        })
        .returning();
      return machine;
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
