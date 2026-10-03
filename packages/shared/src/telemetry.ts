import { z } from 'zod';

/**
 * Provider-independent telemetry record. Every provider adapter converts its
 * own payload into this shape before anything else touches it.
 */
export const telemetryPointSchema = z.object({
  provider: z.string(),
  deviceExternalId: z.string(),
  recordedAt: z.coerce.date(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  speedKmh: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  batterySoc: z.number().min(0).max(100).optional(),
  engineHours: z.number().min(0).optional(),
  ignition: z.boolean().optional(),
  /** Codes currently active on the machine; an empty array means "no errors". */
  errorCodes: z.array(z.string()).optional(),
  raw: z.unknown(),
});
export type TelemetryPoint = z.infer<typeof telemetryPointSchema>;

/** Latest known state of a machine, pushed to clients in real time. */
export const machineLiveStateSchema = z.object({
  machineId: z.string().uuid(),
  organizationId: z.string().uuid(),
  lastSeenAt: z.coerce.date(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  speedKmh: z.number().nullable(),
  heading: z.number().nullable(),
  batterySoc: z.number().nullable(),
  engineHours: z.number().nullable(),
  ignition: z.boolean().nullable(),
  activeErrorCodes: z.array(z.string()),
});
export type MachineLiveState = z.infer<typeof machineLiveStateSchema>;

/** Socket.IO event names shared by the API and the clients. */
export const LIVE_EVENTS = {
  machineState: 'machine:state',
} as const;

/** Redis pub/sub channel carrying live state for one organization. */
export const liveChannel = (organizationId: string) => `live:org:${organizationId}`;

/** Redis stream that buffers normalized telemetry between ingestion and storage. */
export const TELEMETRY_STREAM = 'telemetry:points';
