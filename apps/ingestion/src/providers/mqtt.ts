import type { TelemetryPoint } from '@rental/shared';
import mqtt, { type MqttClient } from 'mqtt';
import { logger } from '../logger.js';
import type { TelemetryProvider } from './types.js';

export interface MqttProviderOptions {
  id: string;
  url: string;
  username?: string;
  password?: string;
  /** Must be unique per running instance, or the broker disconnects the older one. */
  clientId: string;
  /** Topic filter to subscribe to, e.g. "devices/+/telemetry" */
  topic: string;
  /**
   * MQTT shared-subscription group. When set, instances in the same group
   * split the messages between them instead of each receiving all of them.
   * Needs broker support (Mosquitto 2, EMQX, HiveMQ, AWS IoT all have it).
   */
  shareGroup?: string;
  /** Converts one MQTT message into zero or more telemetry points. */
  parse(topic: string, payload: Buffer): TelemetryPoint[];
}

/**
 * Generic MQTT adapter. A vendor that speaks MQTT only needs a topic filter and
 * a `parse` function. Uses a persistent session + QoS 1 so messages sent while
 * we are briefly disconnected are redelivered.
 */
export class MqttProvider implements TelemetryProvider {
  readonly id: string;
  private client?: MqttClient;

  constructor(private readonly options: MqttProviderOptions) {
    this.id = options.id;
  }

  async start(onPoint: (point: TelemetryPoint) => Promise<void>): Promise<void> {
    const { url, username, password, clientId, shareGroup } = this.options;
    const topic = shareGroup ? `$share/${shareGroup}/${this.options.topic}` : this.options.topic;
    const log = logger.child({ provider: this.id });

    this.client = await mqtt.connectAsync(url, {
      username,
      password,
      clientId,
      clean: false,
      reconnectPeriod: 2000,
    });
    this.client.on('error', (err) => log.error({ err }, 'mqtt error'));
    this.client.on('reconnect', () => log.warn('mqtt reconnecting'));

    this.client.on('message', (msgTopic, payload) => {
      let points: TelemetryPoint[];
      try {
        points = this.options.parse(msgTopic, payload);
      } catch (err) {
        log.warn({ err, topic: msgTopic }, 'dropping unparseable message');
        return;
      }
      for (const point of points) {
        onPoint(point).catch((err) => log.error({ err }, 'failed to enqueue point'));
      }
    });

    await this.client.subscribeAsync(topic, { qos: 1 });
    log.info({ url, topic }, 'subscribed');
  }

  async stop(): Promise<void> {
    await this.client?.endAsync();
  }
}
