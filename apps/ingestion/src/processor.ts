import { errorEvents, machineState, telemetry, type Database } from '@rental/db';
import { liveChannel, type MachineLiveState, type TelemetryPoint } from '@rental/shared';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { DeviceRegistry, ResolvedDevice } from './device-registry.js';
import { diffErrorCodes } from './errors.js';

interface Resolved {
  point: TelemetryPoint;
  device: ResolvedDevice;
  engineHours?: number;
}

export interface BatchResult {
  written: number;
  unknownDevices: number;
}

/** Keeps each INSERT well under Postgres' 65,535 bind-parameter limit. */
const INSERT_CHUNK = 2000;

export class TelemetryProcessor {
  constructor(
    private readonly db: Database,
    private readonly registry: DeviceRegistry,
    private readonly publisher: Redis,
  ) {}

  /**
   * Stores a batch: raw rows into the hypertable, then (for points newer than
   * what we have) the per-machine latest state and error open/close events.
   * Everything commits together; live updates are published afterwards.
   */
  async process(points: TelemetryPoint[]): Promise<BatchResult> {
    const resolved: Resolved[] = [];
    let unknownDevices = 0;
    for (const point of points) {
      const device = await this.registry.resolve(point.provider, point.deviceExternalId);
      if (!device) {
        unknownDevices++;
        continue;
      }
      const engineHours =
        point.engineHours === undefined ? undefined : point.engineHours + device.engineHoursOffset;
      resolved.push({ point, device, engineHours });
    }
    if (resolved.length === 0) return { written: 0, unknownDevices };

    const live = await this.db.transaction(async (tx) => {
      // 1. Raw history. Re-delivered messages hit the (machine_id, time) key and are skipped.
      const rows = resolved.map(({ point: p, device: d, engineHours }) => ({
        time: p.recordedAt,
        organizationId: d.organizationId,
        machineId: d.machineId,
        location: p.lat !== undefined && p.lon !== undefined ? { lat: p.lat, lon: p.lon } : null,
        speedKmh: p.speedKmh ?? null,
        heading: p.heading ?? null,
        batterySoc: p.batterySoc ?? null,
        engineHours: engineHours ?? null,
        ignition: p.ignition ?? null,
        errorCodes: p.errorCodes ?? null,
        raw: p.raw ?? null,
      }));
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        await tx.insert(telemetry).values(rows.slice(i, i + INSERT_CHUNK)).onConflictDoNothing();
      }

      // 2. Per-machine latest state and error transitions, in time order.
      const byMachine = new Map<string, Resolved[]>();
      for (const r of resolved) {
        const list = byMachine.get(r.device.machineId) ?? [];
        list.push(r);
        byMachine.set(r.device.machineId, list);
      }
      const current = await tx
        .select({
          machineId: machineState.machineId,
          lastSeenAt: machineState.lastSeenAt,
          activeErrorCodes: machineState.activeErrorCodes,
        })
        .from(machineState)
        .where(inArray(machineState.machineId, [...byMachine.keys()]));
      const currentById = new Map(current.map((c) => [c.machineId, c]));

      const latest: { r: Resolved; activeErrorCodes: string[] }[] = [];
      for (const [machineId, list] of byMachine) {
        list.sort((a, b) => a.point.recordedAt.getTime() - b.point.recordedAt.getTime());
        const state = currentById.get(machineId);
        let lastSeen = state?.lastSeenAt.getTime() ?? 0;
        let codes = state?.activeErrorCodes ?? [];
        let newest: Resolved | undefined;

        for (const r of list) {
          const at = r.point.recordedAt;
          if (at.getTime() <= lastSeen) continue; // late or duplicate: history only
          lastSeen = at.getTime();
          newest = r;
          if (!r.point.errorCodes) continue;

          const { opened, cleared } = diffErrorCodes(codes, r.point.errorCodes);
          if (opened.length > 0) {
            await tx
              .insert(errorEvents)
              .values(
                opened.map((code) => ({
                  organizationId: r.device.organizationId,
                  machineId,
                  code,
                  severity: this.registry.severity(r.device.organizationId, r.point.provider, code),
                  startedAt: at,
                })),
              )
              .onConflictDoNothing();
          }
          if (cleared.length > 0) {
            await tx
              .update(errorEvents)
              .set({ clearedAt: at })
              .where(
                and(
                  eq(errorEvents.machineId, machineId),
                  inArray(errorEvents.code, cleared),
                  isNull(errorEvents.clearedAt),
                ),
              );
          }
          codes = r.point.errorCodes;
        }
        if (newest) latest.push({ r: newest, activeErrorCodes: codes });
      }

      if (latest.length === 0) return [];

      // Fields a reading omits keep their previous value.
      const keep = (col: string) => sql.raw(`coalesce(excluded.${col}, machine_state.${col})`);
      const states = await tx
        .insert(machineState)
        .values(
          latest.map(({ r, activeErrorCodes }) => ({
            machineId: r.device.machineId,
            organizationId: r.device.organizationId,
            lastSeenAt: r.point.recordedAt,
            location:
              r.point.lat !== undefined && r.point.lon !== undefined
                ? { lat: r.point.lat, lon: r.point.lon }
                : null,
            speedKmh: r.point.speedKmh ?? null,
            heading: r.point.heading ?? null,
            batterySoc: r.point.batterySoc ?? null,
            engineHours: r.engineHours ?? null,
            ignition: r.point.ignition ?? null,
            activeErrorCodes,
          })),
        )
        .onConflictDoUpdate({
          target: machineState.machineId,
          set: {
            lastSeenAt: sql`excluded.last_seen_at`,
            location: keep('location'),
            speedKmh: keep('speed_kmh'),
            heading: keep('heading'),
            batterySoc: keep('battery_soc'),
            engineHours: keep('engine_hours'),
            ignition: keep('ignition'),
            activeErrorCodes: sql`excluded.active_error_codes`,
          },
          // Another consumer may have stored a newer reading meanwhile.
          setWhere: sql`machine_state.last_seen_at < excluded.last_seen_at`,
        })
        .returning();

      return states.map(
        (s): MachineLiveState => ({
          machineId: s.machineId,
          organizationId: s.organizationId,
          lastSeenAt: s.lastSeenAt,
          lat: s.location?.lat ?? null,
          lon: s.location?.lon ?? null,
          speedKmh: s.speedKmh,
          heading: s.heading,
          batterySoc: s.batterySoc,
          engineHours: s.engineHours,
          ignition: s.ignition,
          activeErrorCodes: s.activeErrorCodes,
        }),
      );
    });

    // 3. Fan out to API instances (Socket.IO rooms per organization).
    if (live.length > 0) {
      const pipeline = this.publisher.pipeline();
      for (const state of live) pipeline.publish(liveChannel(state.organizationId), JSON.stringify(state));
      await pipeline.exec();
    }

    return { written: resolved.length, unknownDevices };
  }
}
