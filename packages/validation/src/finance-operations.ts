import { z } from 'zod';
import { customerCursorSchema } from './customers.js';
import { specifiedTaxSchema, taxSchema } from './tax.js';

export const settlementAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,27})(\.\d{1,2})?$/)
  .refine((v) => !/^0(?:\.0+)?$/.test(v));
const amount = z.string();
const note = (max: number) => z.string().trim().max(max).nullable();
export const financeCurrencySchema = z.enum(['TRY', 'USD', 'EUR']);
export const financeKindSchema = z.enum(['RECEIVABLE', 'PAYABLE']);
export const financeDocumentSchema = z
  .strictObject({
    documentStatus: z.enum(['NONE', 'PENDING', 'RECORDED', 'OTHER']),
    documentReference: note(200),
  })
  .refine(
    (v) =>
      !['RECORDED', 'OTHER'].includes(v.documentStatus) ||
      Boolean(v.documentReference),
    { path: ['documentReference'] },
  );
const installment = z.strictObject({
  kind: z.enum(['DEPOSIT', 'INSTALLMENT', 'DUE']),
  dueOn: z.iso.date(),
  amount: settlementAmountSchema,
});
export const financeRecordInputSchema = z
  .strictObject({
    kind: financeKindSchema,
    title: z.string().trim().min(1).max(200),
    customerId: z.uuid().nullable(),
    machineId: z.uuid().nullable(),
    rentalId: z.uuid().nullable(),
    branchId: z.uuid().nullable(),
    acquisitionMethod: z.enum(['CASH', 'OPEN_ACCOUNT', 'LEASING']).nullable(),
    counterpartyName: note(200),
    occurredOn: z.iso.date(),
    amount: settlementAmountSchema,
    currency: financeCurrencySchema,
    tax: specifiedTaxSchema,
    documentStatus: financeDocumentSchema.shape.documentStatus,
    documentReference: note(200),
    notes: note(5000),
    installments: z.array(installment).max(120),
  })
  .refine(
    (v) =>
      v.kind === 'RECEIVABLE'
        ? Boolean(v.customerId) &&
          v.machineId === null &&
          v.acquisitionMethod === null &&
          v.counterpartyName === null
        : Boolean(v.machineId && v.acquisitionMethod && v.counterpartyName) &&
          v.customerId === null &&
          v.rentalId === null,
    { path: ['kind'] },
  )
  .refine(
    (v) =>
      financeDocumentSchema.safeParse({
        documentStatus: v.documentStatus,
        documentReference: v.documentReference,
      }).success,
    { path: ['documentReference'] },
  );
export const financeRecordEditSchema = z.strictObject({
  version: z.iso.datetime({ offset: true }),
  record: financeRecordInputSchema,
});
export const financeVersionSchema = z.strictObject({
  version: z.iso.datetime({ offset: true }),
});
export const financeCancelSchema = financeVersionSchema.extend({
  reason: z.string().trim().min(1).max(1000),
});
export const financeReverseSchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
});
export const financePaymentInputSchema = z.strictObject({
  installmentId: z.uuid(),
  idempotencyKey: z.uuid(),
  amount: settlementAmountSchema,
  currency: financeCurrencySchema,
  paidOn: z.iso.date(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']),
  reference: note(200),
});
export const financeRecordsQuerySchema = z.strictObject({
  kind: financeKindSchema,
  q: z.string().trim().max(200).default(''),
  customerId: z.uuid().optional(),
  machineId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']).optional(),
  cursor: customerCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const financePaymentViewSchema = financePaymentInputSchema
  .omit({ idempotencyKey: true })
  .strip()
  .extend({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    reversedAt: z.iso.datetime().nullable(),
    reversalReason: z.string().nullable(),
  });
export const financeRecordViewSchema = z
  .object(financeRecordInputSchema.shape)
  .omit({ tax: true, installments: true })
  .extend({
    id: z.uuid(),
    organizationId: z.uuid(),
    status: z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']),
    tax: taxSchema,
    customerName: z.string().nullable(),
    fleetNumber: z.string().nullable(),
    rentalNumber: z.string().nullable(),
    branchName: z.string().nullable(),
    timezone: z.string(),
    netAmount: amount,
    taxAmount: amount,
    grossAmount: amount,
    paidAmount: amount,
    remainingAmount: amount,
    settlementStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']),
    installments: z.array(
      installment.strip().extend({
        id: z.uuid(),
        paidAmount: amount,
        remainingAmount: amount,
        overdue: z.boolean(),
      }),
    ),
    payments: z.array(financePaymentViewSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    confirmedAt: z.iso.datetime().nullable(),
    cancelledAt: z.iso.datetime().nullable(),
    cancellationReason: z.string().nullable(),
  });
export const financeRecordsPageSchema = z.object({
  items: z.array(financeRecordViewSchema),
  nextCursor: customerCursorSchema.nullable(),
});
export const financeBalancesSchema = z.array(
  z.object({
    currency: z.string(),
    grossAmount: amount,
    paidAmount: amount,
    remainingAmount: amount,
  }),
);
export type FinanceInput = z.infer<typeof financeRecordInputSchema>;
export type FinanceView = z.infer<typeof financeRecordViewSchema>;
export type FinanceQuery = z.infer<typeof financeRecordsQuerySchema>;
export type FinancePaymentInput = z.infer<typeof financePaymentInputSchema>;
export type FinanceDocument = z.infer<typeof financeDocumentSchema>;
