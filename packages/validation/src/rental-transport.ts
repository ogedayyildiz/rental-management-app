import { z } from 'zod';
import { specifiedTaxSchema } from './tax.js';
import { financeCurrencySchema } from './finance-operations.js';

const amount = z.string().regex(/^(0|[1-9]\d{0,27})(\.\d{1,2})?$/);
export const transportSupplierSchema = z.strictObject({
  name: z.string().trim().max(200).nullable().default(null),
  amount,
  tax: specifiedTaxSchema,
});
export const rentalTransportInputSchema = z.strictObject({
  currency: financeCurrencySchema,
  customerPrice: amount,
  customerTax: specifiedTaxSchema,
  // Omitted on an edit preserves a supplier quote the actor may not see.
  supplierQuote: transportSupplierSchema.nullable().optional(),
});
export type RentalTransportInput = z.infer<typeof rentalTransportInputSchema>;
export const rentalTransportViewSchema = z.object({
  id: z.uuid(),
  currency: financeCurrencySchema.optional(),
  customerPrice: amount.optional(),
  customerTax: specifiedTaxSchema.optional(),
  supplierQuote: transportSupplierSchema.nullable().optional(),
  estimatedMargin: z.string().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  removedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type RentalTransportView = z.infer<typeof rentalTransportViewSchema>;
