import { z } from 'zod';

export const attentionDomainSchema = z.enum([
  'RENTAL',
  'MAINTENANCE',
  'TELEMETRY',
]);
export const attentionKindSchema = z.enum([
  'DISPATCH_DUE',
  'RESERVATION_SOON',
  'RETURN_TODAY',
  'RETURN_OVERDUE',
  'MAINTENANCE_OVERDUE',
  'MAINTENANCE_DUE',
  'MAINTENANCE_START',
  'MAINTENANCE_IN_PROGRESS',
  'PLAN_DUE',
  'SERVICE_BLOCKED',
  'TELEMETRY_OFFLINE',
  'TELEMETRY_FAULT',
  'LOW_BATTERY',
]);
export const notificationPreferencesSchema = z
  .object({
    enabled: z.boolean().default(true),
    domains: z
      .array(attentionDomainSchema)
      .max(3)
      .default(['RENTAL', 'MAINTENANCE', 'TELEMETRY']),
    lowSocPercent: z.number().int().min(0).max(100).default(20),
  })
  .strict();
export const notificationActionSchema = z
  .object({
    action: z.enum(['READ', 'UNREAD', 'ACKNOWLEDGE', 'DISMISS']),
  })
  .strict();
export const operationsQuerySchema = z
  .object({
    branchId: z.string().uuid().optional(),
  })
  .strict();
export const operationsSearchSchema = operationsQuerySchema.extend({
  q: z.string().trim().min(1).max(200),
});
export const attentionSchema = z.object({
  key: z.string().regex(/^[a-f0-9]{64}$/),
  domain: attentionDomainSchema,
  kind: attentionKindSchema,
  sourceId: z.string().uuid(),
  label: z.string(),
  detail: z.string().nullable(),
  href: z.string().startsWith('/'),
  at: z.string().datetime(),
  severity: z.enum(['INFO', 'WARNING', 'HIGH']),
  readAt: z.string().datetime().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
  dismissedAt: z.string().datetime().nullable(),
});
export const operationsMetricSchema = z.object({
  key: z.enum([
    'activeRentals',
    'reservationsSoon',
    'returnsToday',
    'overdueRentals',
    'availableMachines',
    'reservedMachines',
    'rentedMachines',
    'maintenanceMachines',
    'overdueMaintenance',
    'activeFaults',
    'offlineMachines',
  ]),
  value: z.number().int().nonnegative(),
  href: z.string().startsWith('/'),
});
export const operationsDashboardSchema = z.object({
  generatedAt: z.string().datetime(),
  timezone: z.string(),
  today: z.string(),
  upcomingThrough: z.string(),
  branches: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  metrics: z.array(operationsMetricSchema),
  attention: z.array(attentionSchema),
  timeline: z.array(attentionSchema),
  notifications: z.array(attentionSchema),
  preferences: notificationPreferencesSchema,
  // Lists are bounded independently; counts always represent the full scoped snapshot.
  attentionTotal: z.number().int(),
  timelineTotal: z.number().int(),
  notificationTotal: z.number().int(),
  unreadTotal: z.number().int(),
});
export const operationsSearchResultSchema = z.object({
  items: z.array(
    z.object({
      source: z.enum([
        'CUSTOMER',
        'MACHINE',
        'RENTAL',
        'MAINTENANCE',
        'DEVICE',
      ]),
      id: z.string().uuid(),
      label: z.string(),
      href: z.string().startsWith('/'),
    }),
  ),
  limited: z.boolean(),
});
export type Attention = z.infer<typeof attentionSchema>;
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;
export type OperationsDashboard = z.infer<typeof operationsDashboardSchema>;
export type OperationsQuery = z.infer<typeof operationsQuerySchema>;
