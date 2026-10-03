import type { TelemetryPoint } from '@rental/shared';

/**
 * A source of telemetry from one hardware/GPS vendor. Adapters translate the
 * vendor's transport and payload into TelemetryPoint; nothing downstream knows
 * which vendor a point came from except via `provider`.
 */
export interface TelemetryProvider {
  readonly id: string;
  start(onPoint: (point: TelemetryPoint) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}
