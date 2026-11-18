import { createHash } from 'node:crypto';
import { resolveDeviceInstallation, type PrismaClient } from '@rental/database';
import { frameSchema, type Frame } from '@rental/validation';

// A transport supplies a provisioned binding after authenticating its peer. Never deserialize it from a packet.
export interface SourceBinding {
  readonly provider: string;
  readonly organizationId: string;
  readonly externalId: string;
}
export interface TelemetryAdapter {
  readonly transport: 'simulator' | 'proprietary-tcp' | 'cloud-api';
  decode(payload: unknown): Frame;
}
export interface FaultChange {
  installation: string;
  code: string;
  active: boolean;
  recordedAt: Date;
}
export async function ingest(
  db: PrismaClient,
  binding: SourceBinding,
  adapter: TelemetryAdapter,
  payload: unknown,
  received = new Date(),
) {
  const evidence = JSON.stringify(payload);
  if (!evidence || Buffer.byteLength(evidence) > 65536)
    throw Error('Invalid fixture payload size');
  const frame = frameSchema.parse(adapter.decode(payload)),
    recorded = new Date(frame.recordedAt);
  if (
    recorded > received ||
    (!Object.keys(frame.signals).length && !frame.fault)
  )
    throw Error('Invalid observation');
  const digest = createHash('sha256').update(evidence).digest('hex');
  return db.$transaction(async (tx) => {
    const dev = await tx.trackingDevice.findUnique({
      where: {
        organizationId_provider_providerDeviceId: {
          organizationId: binding.organizationId,
          provider: binding.provider,
          providerDeviceId: binding.externalId,
        },
      },
    });
    if (!dev) throw Error('Unknown source');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dev.id},0))`;
    const a = await resolveDeviceInstallation(
      tx,
      dev.organizationId,
      dev.id,
      recorded,
    );
    if (!a) throw Error('No installation at observation');
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`INSERT INTO telemetry_event(org,machine,device,installation,source_event,recorded,received,digest) VALUES(${a.organizationId}::uuid,${a.machineId}::uuid,${dev.id}::uuid,${a.id}::uuid,${frame.eventId},${recorded},${received},${digest}) ON CONFLICT(device,source_event) DO NOTHING RETURNING id`;
    const event = rows[0]?.id;
    if (!event) {
      const [old] = await tx.$queryRaw<
        { digest: string }[]
      >`SELECT digest FROM telemetry_event WHERE device=${dev.id}::uuid AND source_event=${frame.eventId}`;
      if (old?.digest !== digest) throw Error('Conflicting event identifier');
      return { duplicate: true };
    }
    await tx.$executeRaw`INSERT INTO telemetry_contact VALUES(${a.id}::uuid,${recorded}) ON CONFLICT(installation) DO UPDATE SET recorded=greatest(telemetry_contact.recorded,excluded.recorded)`;
    for (const [signal, v] of Object.entries(frame.signals)) {
      await tx.$executeRaw`WITH observation AS (INSERT INTO telemetry_measurement(source_event,event,recorded,received,org,machine,device,installation,signal,value,quality,healthy) VALUES(${frame.eventId},${event}::uuid,${recorded},${received},${a.organizationId}::uuid,${a.machineId}::uuid,${dev.id}::uuid,${a.id}::uuid,${signal},${JSON.stringify(v)}::jsonb,${frame.quality},${frame.healthy}) RETURNING *) INSERT INTO telemetry_latest SELECT * FROM observation ON CONFLICT(installation,signal) DO UPDATE SET source_event=excluded.source_event,event=excluded.event,recorded=excluded.recorded,received=excluded.received,value=excluded.value,quality=excluded.quality,healthy=excluded.healthy WHERE (excluded.recorded,excluded.source_event)>(telemetry_latest.recorded,telemetry_latest.source_event)`;
    }
    const f = frame.fault;
    let change: FaultChange | undefined;
    if (f) {
      await tx.$executeRaw`INSERT INTO telemetry_fault_event VALUES (${event}::uuid,${f.code},${f.active},${f.severity ?? null})`;
      // Reconstruct in event time so a late clear cannot clear a later recurrence.
      const [state] = await tx.$queryRaw<
        {
          active: boolean;
          severity: string | null;
          first_seen: Date;
          last_seen: Date;
          occurrences: number;
        }[]
      >`WITH timeline AS (SELECT e.recorded,e.source_event,f.active,f.severity,lag(f.active) OVER(ORDER BY recorded,source_event) AS previous FROM telemetry_event e JOIN telemetry_fault_event f ON f.event=e.id WHERE e.installation=${a.id}::uuid AND f.code=${f.code}), stats AS (SELECT coalesce(max(recorded) FILTER(WHERE active AND previous IS DISTINCT FROM true),min(recorded)) first_seen,count(*) FILTER(WHERE active AND previous IS DISTINCT FROM true)::int occurrences FROM timeline) SELECT active,severity,recorded last_seen,first_seen,occurrences FROM timeline,stats ORDER BY recorded DESC,source_event DESC LIMIT 1`;
      if (!state) throw Error('Missing fault observation');
      const [old] = await tx.$queryRaw<
        { active: boolean }[]
      >`SELECT active FROM telemetry_fault_current WHERE installation=${a.id}::uuid AND code=${f.code}`;
      await tx.$executeRaw`INSERT INTO telemetry_fault_current VALUES(${a.id}::uuid,${f.code},${state.active},${state.severity},${state.first_seen},${state.last_seen},${state.occurrences}) ON CONFLICT(installation,code) DO UPDATE SET active=excluded.active,severity=excluded.severity,first_seen=excluded.first_seen,last_seen=excluded.last_seen,occurrences=excluded.occurrences`;
      if ((old?.active ?? false) !== state.active)
        change = {
          installation: a.id,
          code: f.code,
          active: state.active,
          recordedAt: state.last_seen,
        };
    }
    return { duplicate: false, change };
  });
}
export const fixtureAdapter = (
  transport: TelemetryAdapter['transport'],
): TelemetryAdapter => ({
  transport,
  decode: (payload) => frameSchema.parse(payload),
});
export function simulatedFrame(step: number, recorded: Date): Frame {
  return frameSchema.parse({
    eventId: 'sim-' + recorded.toISOString() + '-' + step,
    recordedAt: recorded.toISOString(),
    signals: {
      location: { latitude: 41 + step / 1000, longitude: 29 + step / 1000 },
      speedKph: step === 2 ? 0 : 3,
      operatingHours: 100 + step,
      distanceKm: 50 + step,
      batterySoc: [80, 74, 88][step % 3],
      batteryVoltage: 48,
      batteryTemperature: 22 + step,
      charging: step === 2,
      activity: step === 2 ? 'CHARGING' : 'ACTIVE',
      canMotorRpm: step === 2 ? 0 : 1250,
    },
    fault: { code: 'SIM_DRIVE', active: step !== 2, severity: 'WARNING' },
  });
}
