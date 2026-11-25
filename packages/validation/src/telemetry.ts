import { z } from 'zod';
export const signalNames = [
  'location',
  'speedKph',
  'operatingHours',
  'distanceKm',
  'batterySoc',
  'batteryVoltage',
  'batteryTemperature',
  'charging',
  'activity',
  'canMotorRpm',
] as const;
const magnitude = z.number().nonnegative();
export const signalsSchema = z
  .strictObject({
    location: z.strictObject({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    }),
    speedKph: magnitude,
    operatingHours: magnitude,
    distanceKm: magnitude,
    batterySoc: magnitude.max(100),
    batteryVoltage: magnitude,
    batteryTemperature: z.number().min(-273.15),
    charging: z.boolean(),
    activity: z.enum(['ACTIVE', 'IDLE', 'CHARGING']),
    canMotorRpm: z.number(),
  })
  .partial();
const name = z.string().trim().min(1).max(100);
export const frameSchema = z.strictObject({
  eventId: name,
  recordedAt: z.iso.datetime(),
  signals: signalsSchema,
  quality: z.number().min(0).max(1).default(1),
  healthy: z.boolean().default(true),
  fault: z
    .strictObject({
      code: name,
      active: z.boolean(),
      severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
    })
    .optional(),
});
export const devicePatch = z.strictObject({
  serialNumber: name.nullable().optional(),
  deviceModel: name.nullable().optional(),
  priorities: z
    .partialRecord(z.enum(signalNames), z.int().min(0).max(100))
    .optional(),
});
export const deviceCreate = devicePatch.extend({
  provider: name,
  providerDeviceId: z.string().trim().min(1).max(200),
});
export const deviceAssignment = z.strictObject({ machineId: z.uuid() });
export const historyQuery = z
  .strictObject({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    signals: z
      .string()
      .max(200)
      .transform((s) => s.split(','))
      .pipe(z.array(z.enum(signalNames)).min(1).max(signalNames.length)),
    limit: z.coerce.number().int().min(1).max(2000).default(500),
  })
  .refine(
    (q) =>
      Date.parse(q.to) > Date.parse(q.from) &&
      Date.parse(q.to) - Date.parse(q.from) <= 31 * 86400000,
  );
export type Frame = z.output<typeof frameSchema>;
export type Signal = (typeof signalNames)[number];
