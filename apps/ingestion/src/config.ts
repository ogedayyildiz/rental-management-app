import { hostname } from 'node:os';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

export const config = {
  databaseUrl: required('DATABASE_URL_INGEST'),
  redisUrl: required('REDIS_URL'),
  mqttUrl: required('MQTT_URL'),
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,
  /** Comma-separated provider ids to start, e.g. "simulator" */
  providers: (process.env.INGEST_PROVIDERS ?? 'simulator').split(',').map((p) => p.trim()),
  batchSize: Number(process.env.INGEST_BATCH_SIZE ?? 1000),
  /**
   * Stable per-instance name (defaults to the container hostname). Used as the
   * Redis consumer name and in the MQTT client id, so a restarted instance
   * resumes its own pending work and broker session.
   */
  consumerName: process.env.INGEST_CONSUMER_NAME ?? hostname(),
  /** Approximate cap on the buffer stream length */
  streamMaxLen: Number(process.env.INGEST_STREAM_MAXLEN ?? 1_000_000),
};
