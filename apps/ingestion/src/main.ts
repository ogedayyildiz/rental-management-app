import { createDb } from '@rental/db';
import type { TelemetryPoint } from '@rental/shared';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { DeviceRegistry } from './device-registry.js';
import { logger } from './logger.js';
import { TelemetryProcessor } from './processor.js';
import { createProviders } from './providers/index.js';
import { TelemetryStream, type StreamEntry } from './stream.js';

const { db, client: pg } = createDb(config.databaseUrl);
// Separate connections: the consumer blocks on XREADGROUP.
const producerRedis = new Redis(config.redisUrl);
const consumerRedis = new Redis(config.redisUrl);

const stream = new TelemetryStream(producerRedis, config.streamMaxLen);
const consumerStream = new TelemetryStream(consumerRedis, config.streamMaxLen);
const registry = new DeviceRegistry(db);
const processor = new TelemetryProcessor(db, registry, producerRedis);
const providers = createProviders(config.providers);

const stats = { received: 0, written: 0, unknownDevices: 0, failedBatches: 0 };
let running = true;

async function handle(entries: StreamEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const result = await processor.process(entries.map((e) => e.point));
  await consumerStream.ack(entries.map((e) => e.id));
  stats.written += result.written;
  stats.unknownDevices += result.unknownDevices;
}

async function consumeLoop(): Promise<void> {
  const consumer = config.consumerName;
  // Recover work left behind by a crash of this or another consumer.
  await handle(await consumerStream.read(consumer, config.batchSize, 0, '0'));
  await handle(await consumerStream.claimStale(consumer, 60_000, config.batchSize));

  while (running) {
    try {
      const entries = await consumerStream.read(consumer, config.batchSize, 2000, '>');
      await handle(entries);
    } catch (err) {
      if (!running) break; // connection closed by shutdown()
      stats.failedBatches++;
      logger.error({ err }, 'batch failed; entries stay pending and will be retried');
      await new Promise((r) => setTimeout(r, 2000));
      // Retry this consumer's pending entries before reading new ones.
      await handle(await consumerStream.read(consumer, config.batchSize, 0, '0')).catch(() => {});
    }
  }
}

async function main(): Promise<void> {
  await stream.ensureGroup();
  await registry.reload();

  const enqueue = async (point: TelemetryPoint) => {
    stats.received++;
    await stream.add(point);
  };
  for (const provider of providers) await provider.start(enqueue);

  setInterval(() => logger.info(stats, 'ingestion stats'), 30_000).unref();
  logger.info({ providers: config.providers }, 'ingestion started');
  await consumeLoop();
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  running = false;
  await Promise.allSettled(providers.map((p) => p.stop()));
  consumerRedis.disconnect();
  await producerRedis.quit();
  await pg.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  logger.fatal({ err }, 'ingestion crashed');
  process.exit(1);
});
