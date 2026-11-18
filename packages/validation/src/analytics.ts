import { z } from 'zod';
import { rentalStatusSchema } from './rentals.js';

export const analyticsQuerySchema = z
  .strictObject({
    locale: z.enum(['en', 'tr']).default('en'),
    preset: z
      .enum([
        'THIS_MONTH',
        'PREVIOUS_MONTH',
        'YEAR_TO_DATE',
        'LAST_12_MONTHS',
        'CUSTOM',
      ])
      .default('THIS_MONTH'),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    machineId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    branchId: z.uuid().optional(),
    modelId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    status: rentalStatusSchema.optional(),
    sort: z
      .enum(['ID', 'COMPLETED_VALUE', 'UTILIZATION', 'UNRENTED_TIME'])
      .default('ID'),
    sortCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    group: z
      .enum(['machine', 'customer', 'model', 'category', 'branch'])
      .default('machine'),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (q) =>
      q.preset !== 'CUSTOM' ||
      (!!q.from && !!q.to && Date.parse(q.to) > Date.parse(q.from)),
    { message: 'Invalid reporting period' },
  )
  .refine((q) => q.preset === 'CUSTOM' || (!q.from && !q.to), {
    message: 'Dates require CUSTOM',
  })
  .refine((q) => q.sort !== 'COMPLETED_VALUE' || !!q.sortCurrency, {
    message: 'Monetary ranking requires one explicit currency',
  });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export const analyticsTelemetrySchema = z.object({
  signals: z.array(
    z.object({
      signal: z.string(),
      value: z.unknown(),
      recorded: z.coerce.date(),
      stale: z.boolean(),
    }),
  ),
});
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/);
export const analyticsMoneySchema = z.object({
  currency: z.string().length(3),
  valueTypes: z
    .array(
      z.enum([
        'CONTRACTED_ESTIMATE',
        'ACCRUED_ESTIMATE',
        'COMPLETED_ESTIMATE',
        'FIXED',
        'MANUAL',
      ]),
    )
    .optional(),
  estimatedContractedValue: decimal.optional(),
  estimatedAccruedValue: decimal.optional(),
  estimatedCompletedValue: decimal.optional(),
  maintenanceCost: decimal.optional(),
  estimatedContribution: decimal.optional(),
});
export type AnalyticsMoney = z.infer<typeof analyticsMoneySchema>;
const utilization = z.object({
  observationSeconds: z.number().nonnegative(),
  rentedSeconds: z.number().nonnegative(),
  reservedSeconds: z.number().nonnegative(),
  unrentedSeconds: z.number().nonnegative(),
  percentage: decimal.nullable(),
  excludedMachines: z.number().int().nonnegative(),
});
export const analyticsRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  machineCount: z.number(),
  rentalCount: z.number(),
  activeRentals: z.number(),
  values: z.array(analyticsMoneySchema),
  mixedCurrencies: z.boolean(),
  utilization,
  acquisitionCost: z
    .array(z.object({ currency: z.string(), amount: decimal }))
    .optional(),
  lifetime: z
    .object({
      values: z.array(analyticsMoneySchema),
      recovery: z
        .object({
          currency: z.string(),
          contribution: decimal,
          percentage: decimal.nullable(),
          remaining: decimal.nullable(),
          recovered: z.boolean().nullable(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
  operatingHours: z
    .object({ value: z.number(), recordedAt: z.string(), stale: z.boolean() })
    .optional(),
  averageRentalSeconds: z.number().nullable(),
});
export const analyticsReportSchema = z.object({
  valuationPolicy: z.literal('ESTIMATE_V1'),
  generatedAt: z.string(),
  timezone: z.string(),
  period: z.object({ from: z.string(), to: z.string() }),
  visibility: z.object({
    acquisition: z.boolean(),
    pricing: z.boolean(),
    costs: z.boolean(),
    rentals: z.boolean(),
    maintenance: z.boolean(),
    customers: z.boolean(),
    export: z.boolean(),
  }),
  summary: analyticsRowSchema,
  machinesRented: z.number(),
  machinesUnderMaintenance: z.number(),
  items: z.array(analyticsRowSchema),
  nextCursor: z.string().nullable(),
  trends: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      values: z.array(analyticsMoneySchema),
      utilization,
    }),
  ),
  unavailableEstimates: z.number().optional(),
  unallocatedValues: z.array(analyticsMoneySchema).optional(),
});
export type AnalyticsReport = z.infer<typeof analyticsReportSchema>;
export type AnalyticsRow = z.infer<typeof analyticsRowSchema>;
