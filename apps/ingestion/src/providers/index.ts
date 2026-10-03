import { config } from '../config.js';
import { createSimulatorProvider } from './simulator.js';
import type { TelemetryProvider } from './types.js';

/** Register new hardware vendors here. */
const factories: Record<string, () => TelemetryProvider> = {
  simulator: () =>
    createSimulatorProvider({
      url: config.mqttUrl,
      username: config.mqttUsername,
      password: config.mqttPassword,
      instanceName: config.consumerName,
    }),
};

export function createProviders(ids: string[]): TelemetryProvider[] {
  return ids.map((id) => {
    const factory = factories[id];
    if (!factory) throw new Error(`Unknown telemetry provider "${id}"`);
    return factory();
  });
}

export type { TelemetryProvider } from './types.js';
