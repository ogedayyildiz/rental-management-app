import { taxSchema } from './tax.js';
import { z } from 'zod';
import { machineCostSchema, machineServiceStateSchema } from './machines.js';
import { customerCursorSchema } from './customers.js';
export const workOrderStatusSchema = z.enum([
  'DRAFT',
  'OPEN',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);
export const maintenanceTypeSchema = z.enum([
  'PREVENTIVE',
  'CORRECTIVE',
  'INSPECTION',
  'OTHER',
]);
export const maintenanceImpactSchema = z.enum([
  'INFORMATIONAL',
  'WARNING',
  'RENTAL_BLOCKING',
  'SAFETY_CRITICAL',
]);
export const maintenancePrioritySchema = z.enum([
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
]);
const timestamp = z.iso
  .datetime({ offset: true })
  .transform((v) => new Date(v).toISOString());
const note = (max: number) => z.string().trim().max(max).nullable();
const fields = {
  type: maintenanceTypeSchema,
  impact: maintenanceImpactSchema.default('INFORMATIONAL'),
  priority: maintenancePrioritySchema.default('NORMAL'),
  title: z.string().trim().min(1).max(200),
  description: note(5000).default(null),
  diagnosis: note(5000).default(null),
  technicianNotes: note(5000).default(null),
  branchId: z.uuid().nullable().default(null),
  assignedMembershipId: z.uuid().nullable().default(null),
  externalProvider: note(200).default(null),
  serviceLocation: note(200).default(null),
  plannedAt: timestamp.nullable().default(null),
  plannedEndAt: timestamp.nullable().default(null),
  dueAt: timestamp.nullable().default(null),
};
export const workOrderCreateSchema = z.strictObject({
  ...fields,
  machineId: z.uuid(),
  machinePlanId: z.uuid().nullable().default(null),
  checklist: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
});
export const workOrderPatchSchema = z
  .strictObject({
    type: fields.type.optional(),
    title: fields.title.optional(),
    impact: fields.impact.removeDefault().optional(),
    priority: fields.priority.removeDefault().optional(),
    description: fields.description.removeDefault().optional(),
    diagnosis: fields.diagnosis.removeDefault().optional(),
    technicianNotes: fields.technicianNotes.removeDefault().optional(),
    branchId: fields.branchId.removeDefault().optional(),
    assignedMembershipId: fields.assignedMembershipId
      .removeDefault()
      .optional(),
    externalProvider: fields.externalProvider.removeDefault().optional(),
    serviceLocation: fields.serviceLocation.removeDefault().optional(),
    plannedAt: fields.plannedAt.removeDefault().optional(),
    plannedEndAt: fields.plannedEndAt.removeDefault().optional(),
    dueAt: fields.dueAt.removeDefault().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const maintenanceTransitionSchema = z.strictObject({
  notes: z.string().trim().min(1).max(5000).optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
});
export const maintenanceTaskSchema = z.strictObject({
  completed: z.boolean(),
  notes: note(2000).default(null),
});
export const maintenanceMaterialSchema = z.strictObject({
  description: z.string().trim().min(1).max(200),
  partNumber: note(200).default(null),
  quantity: machineCostSchema.refine((v) => !/^0(?:\.0+)?$/.test(v)),
  unit: z.string().trim().min(1).max(40),
});
export const maintenanceCostSchema = z.strictObject({
  tax: taxSchema.default({ mode: 'UNSPECIFIED' }),
  kind: z.enum(['LABOR', 'PARTS', 'EXTERNAL_SERVICE', 'TRANSPORT', 'OTHER']),
  amount: machineCostSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  description: note(1000).default(null),
});
export const maintenanceBlockSchema = z.strictObject({
  state: machineServiceStateSchema.exclude(['NORMAL']),
  reason: z.string().trim().min(1).max(1000),
});
export const maintenanceReleaseSchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
});
export const maintenanceSearchSchema = z
  .strictObject({
    q: z.string().trim().max(200).default(''),
    machineId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    type: maintenanceTypeSchema.optional(),
    status: workOrderStatusSchema.optional(),
    priority: maintenancePrioritySchema.optional(),
    overdue: z.enum(['true', 'false']).optional(),
    open: z.enum(['true', 'false']).optional(),
    plannedFrom: timestamp.optional(),
    plannedTo: timestamp.optional(),
    dueFrom: timestamp.optional(),
    dueTo: timestamp.optional(),
    cursor: customerCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (v) =>
      (!v.plannedFrom || !v.plannedTo || v.plannedFrom <= v.plannedTo) &&
      (!v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo),
  );
export const maintenancePlanSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  type: maintenanceTypeSchema,
  description: note(5000).default(null),
  interval: z.number().int().positive(),
  intervalUnit: z.enum(['DAYS', 'MONTHS']),
  intervalBasis: z.enum(['COMPLETION', 'SCHEDULED']),
  active: z.boolean().default(true),
  impact: maintenanceImpactSchema.default('WARNING'),
  checklist: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
});
export const machineMaintenancePlanSchema = z.strictObject({
  machineId: z.uuid(),
  planId: z.uuid(),
  nextDueAt: timestamp,
  active: z.boolean().default(true),
});
export const workOrderViewSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  number: z.string(),
  machineId: z.uuid(),
  fleetNumber: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  serviceState: machineServiceStateSchema,
  branchId: z.uuid().nullable(),
  branchName: z.string().nullable(),
  assignedMembershipId: z.uuid().nullable(),
  machinePlanId: z.uuid().nullable(),
  type: maintenanceTypeSchema,
  status: workOrderStatusSchema,
  impact: maintenanceImpactSchema,
  priority: maintenancePrioritySchema,
  title: z.string(),
  description: z.string().nullable(),
  diagnosis: z.string().nullable(),
  technicianNotes: z.string().nullable(),
  completionNotes: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  externalProvider: z.string().nullable(),
  serviceLocation: z.string().nullable(),
  plannedAt: timestamp.nullable(),
  plannedEndAt: timestamp.nullable(),
  dueAt: timestamp.nullable(),
  startedAt: timestamp.nullable(),
  completedAt: timestamp.nullable(),
  cancelledAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  createdById: z.uuid(),
  updatedById: z.uuid(),
  overdue: z.boolean(),
  timezone: z.string(),
  tasks: z.array(
    z.object({
      id: z.uuid(),
      description: z.string(),
      notes: z.string().nullable(),
      completedAt: timestamp.nullable(),
      completedById: z.uuid().nullable(),
    }),
  ),
  materials: z.array(maintenanceMaterialSchema.extend({ id: z.uuid() })),
  costs: z.array(maintenanceCostSchema.extend({ id: z.uuid() })).optional(),
});
export const workOrderPageSchema = z.object({
  items: z.array(workOrderViewSchema),
  nextCursor: customerCursorSchema.nullable(),
});
export type WorkOrderInput = z.output<typeof workOrderCreateSchema>;
export type WorkOrderPatch = z.output<typeof workOrderPatchSchema>;
export type WorkOrderView = z.output<typeof workOrderViewSchema>;
export type MaintenanceSearch = z.output<typeof maintenanceSearchSchema>;
export type MaintenancePlanInput = z.output<typeof maintenancePlanSchema>;

export const machineMaintenancePlanViewSchema =
  machineMaintenancePlanSchema.extend({
    id: z.uuid(),
    planName: z.string(),
    fleetNumber: z.string(),
  });

export const maintenanceIdSchema = z.object({ id: z.uuid() });
export const maintenancePlansSchema = z.array(
  maintenancePlanSchema.extend({ id: z.uuid() }),
);
export const machineMaintenancePlansSchema = z.array(
  machineMaintenancePlanViewSchema,
);
export const serviceRestrictionsSchema = z.array(
  z.object({
    id: z.uuid(),
    state: machineServiceStateSchema,
    workOrderId: z.uuid().nullable(),
  }),
);
