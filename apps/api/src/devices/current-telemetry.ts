import { Prisma } from '@rental/database';
import {
  assertTenantContext,
  type TenantContext,
  requirePermission,
} from '../access/access.service.js';

export type CurrentSignal = {
  signal: string;
  value: unknown;
  recorded: Date;
  received: Date;
  device: string;
  quality: number;
  healthy: boolean;
  stale: boolean;
};
export type CurrentFault = {
  code: string;
  severity: string | null;
  first_seen: Date;
  last_seen: Date;
  occurrences: number;
  device: string;
};
export type CurrentTelemetry = {
  connectivity: 'UNKNOWN' | 'ONLINE' | 'OFFLINE';
  lastUpdate: Date | null;
  installed: boolean;
  signals: CurrentSignal[];
  faults?: CurrentFault[];
};

/** Shared canonical bulk reader for machine detail and operations. No provider payloads. */
export async function currentTelemetry(
  tx: Prisma.TransactionClient,
  c: TenantContext,
  ids: string[],
  now = new Date(),
): Promise<Map<string, CurrentTelemetry>> {
  assertTenantContext(c);
  requirePermission(c, 'telemetry.read');
  if (!ids.length) return new Map();
  // Scope is enforced here even when the caller already loaded an authorized machine set.
  const machines = await tx.machine.findMany({
    where: {
      organizationId: c.organizationId,
      id: { in: ids },
      ...(c.branchScope === 'ALL_BRANCHES'
        ? {}
        : { branchId: { in: [...c.branchIds] } }),
    },
    select: {
      id: true,
      deviceInstallations: {
        where: { removedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!machines.length) return new Map();
  const allowed = Prisma.join(machines.map((m) => m.id));
  const seconds = Number(process.env['TELEMETRY_FRESH_SECONDS'] ?? 300);
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw Error('Invalid telemetry freshness configuration');
  const cutoff = new Date(now.getTime() - seconds * 1000);
  const signals = await tx.$queryRaw<(CurrentSignal & { machine: string })[]>`
    SELECT DISTINCT ON (s.machine,s.signal) s.machine,s.signal,s.value,s.recorded,s.received,s.device,s.quality,s.healthy,
      (s.recorded<${cutoff} OR i."removedAt" IS NOT NULL) stale
    FROM telemetry_latest s JOIN "TrackingDevice" d ON d.id=s.device JOIN "DeviceInstallation" i ON i.id=s.installation
    WHERE s.org=${c.organizationId}::uuid AND s.machine::text IN (${allowed})
    ORDER BY s.machine,s.signal,(i."removedAt" IS NULL AND s.recorded>=${cutoff}) DESC,
      (i."removedAt" IS NULL) DESC,s.healthy DESC,coalesce((d.priorities->>s.signal)::int,0) DESC,s.quality DESC,s.recorded DESC,s.device,s.installation`;
  const contacts = await tx.$queryRaw<
    { machine: string; last: Date | null; live: Date | null }[]
  >`
    SELECT i."machineId" machine,max(e.recorded) last,max(e.recorded) FILTER(WHERE i."removedAt" IS NULL) live
    FROM telemetry_contact e JOIN "DeviceInstallation" i ON i.id=e.installation
    WHERE i."organizationId"=${c.organizationId}::uuid AND i."machineId"::text IN (${allowed}) GROUP BY i."machineId"`;
  const faults = c.permissions.includes('fault.read')
    ? await tx.$queryRaw<(CurrentFault & { machine: string })[]>`
    SELECT i."machineId" machine,f.code,f.severity,f.first_seen,f.last_seen,f.occurrences,i."trackingDeviceId" device
    FROM telemetry_fault_current f JOIN "DeviceInstallation" i ON i.id=f.installation
    WHERE i."organizationId"=${c.organizationId}::uuid AND i."machineId"::text IN (${allowed}) AND i."removedAt" IS NULL AND f.active
    ORDER BY i."machineId",code,device`
    : undefined;
  const result = new Map<string, CurrentTelemetry>();
  for (const m of machines)
    result.set(m.id, {
      connectivity: 'UNKNOWN',
      lastUpdate: null,
      installed: m.deviceInstallations.length > 0,
      signals: [],
      ...(faults ? { faults: [] } : {}),
    });
  for (const v of contacts) {
    const row = result.get(v.machine)!;
    row.lastUpdate = v.last;
    row.connectivity = !v.last
      ? 'UNKNOWN'
      : v.live && v.live >= cutoff
        ? 'ONLINE'
        : 'OFFLINE';
  }
  for (const { machine, ...signal } of signals)
    result.get(machine)!.signals.push(signal);
  for (const { machine, ...fault } of faults ?? [])
    result.get(machine)!.faults!.push(fault);
  return result;
}
