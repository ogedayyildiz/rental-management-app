import { z } from 'zod';

// Rates are supplied for the transaction, never inferred from document presence.
const rate = z.string().regex(/^(0|[1-9]\d{0,2})(\.\d{1,6})?$/);
export const taxSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('UNSPECIFIED') }),
  z.strictObject({ mode: z.literal('EXCLUSIVE'), rate }),
  z.strictObject({ mode: z.literal('INCLUSIVE'), rate }),
  z.strictObject({
    mode: z.literal('NOT_APPLICABLE'),
    reason: z.string().trim().min(1).max(1000),
  }),
]);
export type Tax = z.infer<typeof taxSchema>;
export const specifiedTaxSchema = taxSchema.refine(
  (v) => v.mode !== 'UNSPECIFIED',
);
