import { z } from 'zod';
import { customerCursorSchema } from './customers.js';
const text = (max: number) => z.string().trim().min(1).max(max);
// Normalization can expand Unicode characters; validate the stored comparison key too.
const keyedText = (max: number) =>
  text(max).refine(
    (value) => value.normalize('NFKC').toUpperCase().length <= max,
  );
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();
export const machineRentalStateSchema = z.enum([
  'NOT_RENTED',
  'RESERVED',
  'RENTED',
]);
export const machineServiceStateSchema = z.enum([
  'NORMAL',
  'MAINTENANCE_DUE',
  'MAINTENANCE_REQUIRED',
  'OUT_OF_SERVICE',
  'SERVICE_BLOCKED',
]);
export const machineLifecycleStateSchema = z.enum([
  'ACTIVE',
  'SOLD',
  'RETIRED',
]);
// Static engineering specifications only. Add reviewed keys here without widening Machine columns.
export const machineSpecificationsSchema = z
  .strictObject({
    workingHeightM: z.number().finite().positive().optional(),
    platformHeightM: z.number().finite().positive().optional(),
    platformCapacityKg: z.number().finite().positive().optional(),
    machineWeightKg: z.number().finite().positive().optional(),
    overallLengthM: z.number().finite().positive().optional(),
    overallWidthM: z.number().finite().positive().optional(),
    stowedHeightM: z.number().finite().positive().optional(),
    driveType: text(100).optional(),
    powerSource: text(100).optional(),
    batteryType: text(100).optional(),
  })
  .refine(
    (v) =>
      v.workingHeightM === undefined ||
      v.platformHeightM === undefined ||
      v.workingHeightM >= v.platformHeightM,
    {
      path: ['workingHeightM'],
      message: 'Working height must not be below platform height',
    },
  );
// Storage precision, not a business price ceiling. JSON money always uses decimal strings.
export const machineCostSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,23})(\.\d{1,6})?$/);
export const machineFieldsSchema = z.strictObject({
  fleetNumber: keyedText(100),
  manufacturer: keyedText(200),
  model: keyedText(200),
  category: keyedText(200),
  serialNumber: nullableText(200),
  modelYear: z.number().int().min(1).max(9999).nullable(),
  acquisitionDate: z.iso.date().nullable(),
  acquisitionCost: machineCostSchema.nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  ownershipType: z.enum(['OWNED', 'LEASED', 'THIRD_PARTY']).nullable(),
  branchId: z.uuid().nullable(),
  notes: nullableText(5000),
  specifications: machineSpecificationsSchema,
  serviceState: machineServiceStateSchema,
});
export const machineCreateSchema = machineFieldsSchema
  .extend({
    serialNumber: machineFieldsSchema.shape.serialNumber.default(null),
    modelYear: machineFieldsSchema.shape.modelYear.default(null),
    acquisitionDate: machineFieldsSchema.shape.acquisitionDate.default(null),
    acquisitionCost: machineFieldsSchema.shape.acquisitionCost.default(null),
    currency: machineFieldsSchema.shape.currency.default(null),
    ownershipType: machineFieldsSchema.shape.ownershipType.default(null),
    branchId: machineFieldsSchema.shape.branchId.default(null),
    notes: machineFieldsSchema.shape.notes.default(null),
    specifications: machineSpecificationsSchema.default({}),
    serviceState: machineServiceStateSchema.default('NORMAL'),
  })
  .refine((v) => (v.acquisitionCost === null) === (v.currency === null), {
    path: ['currency'],
    message: 'Cost and currency must be supplied together',
  });
export const machinePatchSchema = machineFieldsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const machineArchiveSchema = z.strictObject({
  lifecycleState: z.enum(['RETIRED', 'SOLD']).default('RETIRED'),
});
export const machineSearchSchema = z.strictObject({
  q: z.string().trim().max(200).default(''),
  fleetNumber: z.string().trim().max(100).optional(),
  manufacturer: z.string().trim().max(200).optional(),
  model: z.string().trim().max(200).optional(),
  serialNumber: z.string().trim().max(200).optional(),
  category: z.string().trim().max(200).optional(),
  branchId: z.uuid().optional(),
  lifecycleState: z
    .enum(['ACTIVE', 'SOLD', 'RETIRED', 'ALL'])
    .default('ACTIVE'),
  rentalState: machineRentalStateSchema.optional(),
  serviceState: machineServiceStateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: customerCursorSchema.optional(),
});
export const machineViewSchema = machineFieldsSchema
  .omit({ acquisitionCost: true, currency: true })
  .extend({
    id: z.uuid(),
    organizationId: z.uuid(),
    modelId: z.uuid(),
    categoryId: z.uuid(),
    branchName: z.string().nullable(),
    acquisitionCost: machineCostSchema.nullable().optional(),
    currency: z.string().nullable().optional(),
    rentalState: machineRentalStateSchema,
    lifecycleState: machineLifecycleStateSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    createdById: z.uuid(),
    updatedById: z.uuid(),
  });
export const machinePageSchema = z.strictObject({
  items: z.array(machineViewSchema),
  nextCursor: customerCursorSchema.nullable(),
});
export const machineBranchListSchema = z.array(
  z.strictObject({ id: z.uuid(), name: z.string() }),
);
export type MachineInput = z.output<typeof machineCreateSchema>;
export type MachinePatch = z.output<typeof machinePatchSchema>;
export type MachineSearch = z.output<typeof machineSearchSchema>;
export type MachineView = z.output<typeof machineViewSchema>;
export type MachinePage = z.output<typeof machinePageSchema>;
export const machineAccessSchema = z.object({
  organizations: z.array(
    z.object({
      name: z.string(),
      access: z
        .object({
          organizationId: z.uuid(),
          permissions: z.array(z.string()),
          branchScope: z.enum(['ALL_BRANCHES', 'SELECTED_BRANCHES']),
        })
        .nullable(),
    }),
  ),
});

export const machineRestoreSchema = z.strictObject({
  reasonCode: z.enum([
    'INCORRECT_SALE',
    'INCORRECT_RETIREMENT',
    'RETURNED_TO_FLEET',
  ]),
});
