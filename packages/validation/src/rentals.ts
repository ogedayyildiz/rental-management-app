import { z } from 'zod';
import { customerCursorSchema } from './customers.js';
import { machineCostSchema, machineSpecificationsSchema } from './machines.js';
export const rentalStatusSchema = z.enum([
  'DRAFT',
  'QUOTED',
  'RESERVED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
]);
export const rentalRateUnitSchema = z.enum([
  'HOURLY',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'FIXED_PERIOD',
  'MANUAL',
]);
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString());
const note = (max: number) => z.string().trim().max(max).nullable();
const period = {
  plannedStartAt: timestamp.nullable(),
  plannedEndAt: timestamp.nullable(),
};
export const rentalItemInputSchema = z
  .strictObject({
    requestedCategoryId: z.uuid().nullable().default(null),
    requestedModelId: z.uuid().nullable().default(null),
    quantity: z.number().int().min(1).max(1000).default(1),
    specifications: machineSpecificationsSchema.default({}),
    machineIds: z.array(z.uuid()).max(1000).default([]),
    plannedStartAt: period.plannedStartAt.default(null),
    plannedEndAt: period.plannedEndAt.default(null),
    agreedRate: machineCostSchema.nullable().optional(),
    rateUnit: rentalRateUnitSchema.nullable().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    commercialNotes: note(2000).optional(),
  })
  .refine(
    (v) =>
      (v.plannedStartAt === null) === (v.plannedEndAt === null) &&
      (!v.plannedStartAt ||
        !v.plannedEndAt ||
        v.plannedStartAt < v.plannedEndAt),
    { path: ['plannedEndAt'] },
  )
  .refine(
    (v) =>
      new Set(v.machineIds).size === v.machineIds.length &&
      v.machineIds.length <= v.quantity,
    { path: ['machineIds'] },
  )
  .refine(
    (v) =>
      [v.agreedRate ?? null, v.rateUnit ?? null, v.currency ?? null].every(
        (x) => x === null,
      ) || [v.agreedRate, v.rateUnit, v.currency].every((x) => x != null),
    { path: ['agreedRate'] },
  );
export const rentalCreateSchema = z.strictObject({
  customerId: z.uuid(),
  branchId: z.uuid().nullable().default(null),
  notes: note(5000).default(null),
  items: z.array(rentalItemInputSchema).max(100).default([]),
});
export const rentalPatchSchema = z
  .strictObject({
    customerId: z.uuid().optional(),
    branchId: z.uuid().nullable().optional(),
    notes: note(5000).optional(),
    items: z.array(rentalItemInputSchema).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const rentalAssignSchema = z
  .strictObject({
    itemId: z.uuid(),
    machineIds: z.array(z.uuid()).min(1).max(1000),
  })
  .refine((v) => new Set(v.machineIds).size === v.machineIds.length);
export const rentalReleaseSchema = z.strictObject({
  assignmentId: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
});
export const rentalDispatchSchema = z.strictObject({
  assignmentIds: z.array(z.uuid()).min(1).max(1000),
  actualStartAt: timestamp,
});
export const rentalReturnSchema = z.strictObject({
  assignmentIds: z.array(z.uuid()).min(1).max(1000),
  actualEndAt: timestamp,
});
export const rentalExtendSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        itemId: z.uuid(),
        plannedEndAt: timestamp,
        agreedRate: machineCostSchema.optional(),
        rateUnit: rentalRateUnitSchema.optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
      }),
    )
    .min(1)
    .max(100),
});
export const rentalCancelSchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
});
export const rentalSearchSchema = z
  .strictObject({
    q: z.string().trim().max(200).default(''),
    customerId: z.uuid().optional(),
    machineId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    status: rentalStatusSchema.optional(),
    current: z.enum(['true', 'false']).optional(),
    plannedFrom: timestamp.optional(),
    plannedTo: timestamp.optional(),
    actualFrom: timestamp.optional(),
    actualTo: timestamp.optional(),
    cursor: customerCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (v) =>
      (!v.plannedFrom || !v.plannedTo || v.plannedFrom < v.plannedTo) &&
      (!v.actualFrom || !v.actualTo || v.actualFrom < v.actualTo),
  );
export const rentalAvailabilitySchema = z
  .strictObject({
    platformHeightM: z.coerce.number().finite().positive().optional(),
    plannedStartAt: timestamp,
    plannedEndAt: timestamp,
    branchId: z.uuid().nullable().default(null),
    requestedCategoryId: z.uuid().optional(),
    requestedModelId: z.uuid().optional(),
    q: z.string().trim().max(200).default(''),
    rentalId: z.uuid().optional(),
    itemId: z.uuid().optional(),
    cursor: customerCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (v) =>
      v.plannedStartAt < v.plannedEndAt &&
      Boolean(v.rentalId) === Boolean(v.itemId),
  );
export const rentalAssignmentViewSchema = z.object({
  id: z.uuid(),
  machineId: z.uuid(),
  fleetNumber: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  assignedAt: timestamp,
  releasedAt: timestamp.nullable(),
  actualStartAt: timestamp.nullable(),
  actualEndAt: timestamp.nullable(),
  reason: z.string().nullable(),
});
const price = {
  agreedRate: machineCostSchema.nullable().optional(),
  rateUnit: rentalRateUnitSchema.nullable().optional(),
  currency: z.string().nullable().optional(),
  commercialNotes: z.string().nullable().optional(),
};
export const rentalTermViewSchema = z.object({
  id: z.uuid(),
  plannedStartAt: timestamp,
  plannedEndAt: timestamp,
  agreedRate: machineCostSchema,
  rateUnit: rentalRateUnitSchema,
  currency: z.string(),
  agreedAt: timestamp,
});
export const rentalItemViewSchema = z.object({
  id: z.uuid(),
  requestedCategoryId: z.uuid().nullable(),
  requestedModelId: z.uuid().nullable(),
  quantity: z.number().int(),
  specifications: machineSpecificationsSchema,
  ...period,
  ...price,
  removedAt: timestamp.nullable(),
  assignments: z.array(rentalAssignmentViewSchema),
  terms: z.array(rentalTermViewSchema).optional(),
});
export const rentalViewSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  number: z.string(),
  customerId: z.uuid(),
  customerName: z.string(),
  branchId: z.uuid().nullable(),
  branchName: z.string().nullable(),
  timezone: z.string(),
  status: rentalStatusSchema,
  notes: z.string().nullable(),
  ...period,
  actualStartAt: timestamp.nullable(),
  actualEndAt: timestamp.nullable(),
  cancelledAt: timestamp.nullable(),
  cancellationReason: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  items: z.array(rentalItemViewSchema),
});
export const rentalPageSchema = z.object({
  items: z.array(rentalViewSchema),
  nextCursor: customerCursorSchema.nullable(),
});
export const rentalAvailabilityPageSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      fleetNumber: z.string(),
      manufacturer: z.string(),
      model: z.string(),
      category: z.string(),
      branchId: z.uuid().nullable(),
      serviceState: z.string(),
    }),
  ),
  nextCursor: customerCursorSchema.nullable(),
});
export const rentalCatalogSchema = z.object({
  categories: z.array(z.object({ id: z.uuid(), name: z.string() })),
  models: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      manufacturer: z.string(),
      categoryId: z.uuid(),
      availableForRental: z.boolean(),
    }),
  ),
  branches: z.array(z.object({ id: z.uuid(), name: z.string() })),
  timezone: z.string(),
});
export type RentalInput = z.output<typeof rentalCreateSchema>;
export type RentalItemInput = z.output<typeof rentalItemInputSchema>;
export type RentalPatch = z.output<typeof rentalPatchSchema>;
export type RentalView = z.output<typeof rentalViewSchema>;
export type RentalItemView = z.output<typeof rentalItemViewSchema>;
export type RentalAssignmentView = z.output<typeof rentalAssignmentViewSchema>;
export type RentalSearch = z.output<typeof rentalSearchSchema>;
export type RentalAvailability = z.output<typeof rentalAvailabilitySchema>;
export type RentalAvailabilityPage = z.output<
  typeof rentalAvailabilityPageSchema
>;
export type RentalCatalog = z.output<typeof rentalCatalogSchema>;
export type RentalStatus = z.output<typeof rentalStatusSchema>;
export type RentalRateUnit = z.output<typeof rentalRateUnitSchema>;

export const rentalReplaceSchema = z.strictObject({
  assignmentId: z.uuid(),
  machineId: z.uuid(),
  actualAt: timestamp,
  reason: z.string().trim().min(1).max(1000),
});
