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
  /** GPS device id as the provider reports it (IMEI/serial); links live tracking */
  gpsDeviceId: z.string().trim().max(120).optional(),
  gpsProvider: z.string().trim().max(60).optional(),
});
export type CreateMachineInput = z.infer<typeof createMachineSchema>;

/** Statuses staff set by hand; rented/reserved follow from rental contracts. */
export const MANUAL_MACHINE_STATUSES = ['available', 'maintenance', 'out_of_service', 'retired'] as const;

export const updateMachineSchema = createMachineSchema.partial().extend({
  status: z.enum(MANUAL_MACHINE_STATUSES).optional(),
});
export type UpdateMachineInput = z.infer<typeof updateMachineSchema>;

const money = z.number().nonnegative().max(1e12);

export const machineModelInputSchema = z.object({
  manufacturer: z.string().trim().min(1).max(120),
  model: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  dailyRate: money.optional(),
  weeklyRate: money.optional(),
  monthlyRate: money.optional(),
});
export type MachineModelInput = z.infer<typeof machineModelInputSchema>;

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
