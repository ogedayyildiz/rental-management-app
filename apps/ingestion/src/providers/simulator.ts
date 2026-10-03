import { SIMULATOR_PROVIDER, telemetryPointSchema, type TelemetryPoint } from '@rental/shared';
import { MqttProvider } from './mqtt.js';

/** Payload published by apps/simulator on devices/{deviceId}/telemetry */
interface SimulatorPayload {
  ts: string;
  lat: number;
  lon: number;
  spd: number;
  hdg: number;
  soc: number;
  hrs: number;
  ign: boolean;
  err: string[];
}

export function parseSimulatorMessage(topic: string, payload: Buffer): TelemetryPoint[] {
  const deviceId = topic.split('/')[1];
  const p = JSON.parse(payload.toString('utf8')) as SimulatorPayload;
  return [
    telemetryPointSchema.parse({
      provider: SIMULATOR_PROVIDER,
      deviceExternalId: deviceId,
      recordedAt: p.ts,
      lat: p.lat,
      lon: p.lon,
      speedKmh: p.spd,
      heading: p.hdg,
      batterySoc: p.soc,
      engineHours: p.hrs,
      ignition: p.ign,
      errorCodes: p.err,
      raw: p,
    }),
  ];
}

export const createSimulatorProvider = (opts: {
  url: string;
  username?: string;
  password?: string;
  instanceName: string;
}) =>
  new MqttProvider({
    id: SIMULATOR_PROVIDER,
    url: opts.url,
    username: opts.username,
    password: opts.password,
    clientId: `rental-ingest-${SIMULATOR_PROVIDER}-${opts.instanceName}`,
    topic: 'devices/+/telemetry',
    shareGroup: 'rental-ingest',
    parse: parseSimulatorMessage,
  });
