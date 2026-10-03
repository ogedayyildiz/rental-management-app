import { TELEMETRY_STREAM, telemetryPointSchema, type TelemetryPoint } from '@rental/shared';
import type { Redis } from 'ioredis';

const GROUP = 'ingest';

export interface StreamEntry {
  id: string;
  point: TelemetryPoint;
}

type XReadResult = [stream: string, entries: [id: string, fields: string[]][]][] | null;

/**
 * Redis Stream buffering normalized points between the MQTT side and the
 * database writer. If Postgres is slow or down, points queue here instead of
 * being lost, and unacknowledged entries are retried after a restart.
 */
export class TelemetryStream {
  constructor(
    private readonly redis: Redis,
    private readonly maxLen: number,
  ) {}

  async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', TELEMETRY_STREAM, GROUP, '0', 'MKSTREAM');
    } catch (err) {
      if (!String(err).includes('BUSYGROUP')) throw err;
    }
  }

  async add(point: TelemetryPoint): Promise<void> {
    await this.redis.xadd(
      TELEMETRY_STREAM,
      'MAXLEN',
      '~',
      String(this.maxLen),
      '*',
      'p',
      JSON.stringify(point),
    );
  }

  /** `id` "0" re-reads this consumer's pending entries; ">" reads new ones. */
  async read(consumer: string, count: number, blockMs: number, id: '0' | '>'): Promise<StreamEntry[]> {
    const res = (await this.redis.xreadgroup(
      'GROUP', GROUP, consumer,
      'COUNT', count,
      'BLOCK', blockMs,
      'STREAMS', TELEMETRY_STREAM, id,
    )) as XReadResult;
    return this.decode(res?.[0]?.[1] ?? []);
  }

  /** Takes over entries left pending by consumers that died. */
  async claimStale(consumer: string, minIdleMs: number, count: number): Promise<StreamEntry[]> {
    const res = (await this.redis.xautoclaim(
      TELEMETRY_STREAM, GROUP, consumer, minIdleMs, '0-0', 'COUNT', count,
    )) as [string, [string, string[]][]];
    return this.decode(res[1] ?? []);
  }

  async ack(ids: string[]): Promise<void> {
    if (ids.length > 0) await this.redis.xack(TELEMETRY_STREAM, GROUP, ...ids);
  }

  private decode(entries: [string, string[]][]): StreamEntry[] {
    // xautoclaim returns null field lists for entries trimmed from the stream.
    return entries
      .filter(([, fields]) => fields && fields[1])
      .map(([id, fields]) => ({ id, point: telemetryPointSchema.parse(JSON.parse(fields[1]!)) }));
  }
}
