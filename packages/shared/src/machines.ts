import { z } from 'zod';
import { MACHINE_STATUSES } from './enums.js';

export const createMachineSchema = z.object({
  modelId: z.string().uuid(),
  name: z.string().min(1).max(120),
  serialNo: z.string().min(1).max(120),
  year: z.number().int().min(1950).max(2100).optional(),
  purchaseDate: z.iso.date().optional(),
  purchasePrice: z.number().nonnegative().optional(),
  homeDepotId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateMachineInput = z.infer<typeof createMachineSchema>;

export const machineListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  serialNo: z.string(),
  status: z.enum(MACHINE_STATUSES),
  manufacturer: z.string(),
  model: z.string(),
  category: z.string(),
  lastSeenAt: z.coerce.date().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  batterySoc: z.number().nullable(),
  engineHours: z.number().nullable(),
  ignition: z.boolean().nullable(),
  activeErrorCodes: z.array(z.string()),
});
export type MachineListItem = z.infer<typeof machineListItemSchema>;

export const telemetryHistoryPointSchema = z.object({
  time: z.coerce.date(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  speedKmh: z.number().nullable(),
  batterySoc: z.number().nullable(),
  engineHours: z.number().nullable(),
  ignition: z.boolean().nullable(),
});
export type TelemetryHistoryPoint = z.infer<typeof telemetryHistoryPointSchema>;
