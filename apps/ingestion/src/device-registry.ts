import { errorCodeCatalog, gpsDevices, machines, type Database } from '@rental/db';
import type { ErrorSeverity } from '@rental/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import { logger } from './logger.js';

export interface ResolvedDevice {
  machineId: string;
  organizationId: string;
  engineHoursOffset: number;
}

const REFRESH_MS = 60_000;
const MISS_RELOAD_MS = 10_000;

/**
 * In-memory map of provider device id → machine/tenant, plus the error code
 * catalog. Fully reloaded every minute (a few MB even at 50k devices); an
 * unknown device triggers an early reload, at most every 10 s.
 */
export class DeviceRegistry {
  private devices = new Map<string, ResolvedDevice>();
  private severities = new Map<string, ErrorSeverity>();
  private loadedAt = 0;
  private loading?: Promise<void>;

  constructor(private readonly db: Database) {}

  async resolve(provider: string, externalId: string): Promise<ResolvedDevice | undefined> {
    const key = `${provider}:${externalId}`;
    const age = Date.now() - this.loadedAt;
    if (age > REFRESH_MS || (!this.devices.has(key) && age > MISS_RELOAD_MS)) {
      await this.reload();
    }
    return this.devices.get(key);
  }

  severity(organizationId: string, provider: string, code: string): ErrorSeverity | null {
    return this.severities.get(`${organizationId}:${provider}:${code}`) ?? null;
  }

  reload(): Promise<void> {
    this.loading ??= this.load().finally(() => (this.loading = undefined));
    return this.loading;
  }

  private async load(): Promise<void> {
    const rows = await this.db
      .select({
        provider: gpsDevices.provider,
        externalId: gpsDevices.externalId,
        machineId: machines.id,
        organizationId: machines.organizationId,
        engineHoursOffset: machines.engineHoursOffset,
      })
      .from(gpsDevices)
      .innerJoin(machines, eq(machines.id, gpsDevices.machineId))
      .where(and(eq(gpsDevices.active, true), isNotNull(gpsDevices.machineId)));

    const catalog = await this.db
      .select({
        organizationId: errorCodeCatalog.organizationId,
        provider: errorCodeCatalog.provider,
        code: errorCodeCatalog.code,
        severity: errorCodeCatalog.severity,
      })
      .from(errorCodeCatalog);

    this.devices = new Map(
      rows.map((r) => [
        `${r.provider}:${r.externalId}`,
        { machineId: r.machineId, organizationId: r.organizationId, engineHoursOffset: r.engineHoursOffset },
      ]),
    );
    this.severities = new Map(
      catalog.map((c) => [`${c.organizationId}:${c.provider}:${c.code}`, c.severity]),
    );
    this.loadedAt = Date.now();
    logger.debug({ devices: this.devices.size }, 'device registry loaded');
  }
}
