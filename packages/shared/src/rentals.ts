import { z } from 'zod';
import { RATE_TYPES, type RateType } from './enums.js';

export const rentalLineInputSchema = z.object({
  machineId: z.string().uuid(),
  rateType: z.enum(RATE_TYPES),
  rate: z.number().nonnegative().max(1e9),
  deliveryFee: z.number().nonnegative().max(1e9).default(0),
});
export type RentalLineInput = z.infer<typeof rentalLineInputSchema>;

/** An offer: customer, period and machines. Confirming it turns it into a booking. */
export const offerInputSchema = z
  .object({
    customerId: z.string().uuid(),
    /** First rental day (inclusive) */
    startDate: z.iso.date(),
    /** Last rental day (inclusive) */
    endDate: z.iso.date(),
    siteAddress: z.string().trim().max(500).optional(),
    terms: z.string().trim().max(5000).optional(),
    items: z.array(rentalLineInputSchema).min(1, 'Add at least one machine'),
  })
  .refine((o) => o.endDate >= o.startDate, { message: 'End date is before start date', path: ['endDate'] })
  .refine((o) => new Set(o.items.map((i) => i.machineId)).size === o.items.length, {
    message: 'A machine is listed twice',
    path: ['items'],
  });
export type OfferInput = z.infer<typeof offerInputSchema>;

export const paymentInputSchema = z.object({
  amount: z.number().positive().max(1e12),
  dueDate: z.iso.date().optional(),
  method: z.string().trim().max(60).optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const receivePaymentSchema = z.object({
  receivedAt: z.iso.date().optional(),
  method: z.string().trim().max(60).optional(),
  reference: z.string().trim().max(120).optional(),
});
export type ReceivePaymentInput = z.infer<typeof receivePaymentSchema>;

const DAY_MS = 86_400_000;

/** Calendar days in an inclusive date range, e.g. 2026-10-01..2026-10-03 = 3. */
export function rentalDays(startDate: string, endDate: string): number {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS) + 1;
}

/** Billable units for a period: partial weeks and months round up. Hourly assumes 8 h/day. */
export function rentalUnits(rateType: RateType, days: number): number {
  switch (rateType) {
    case 'hourly':
      return days * 8;
    case 'daily':
      return days;
    case 'weekly':
      return Math.ceil(days / 7);
    case 'monthly':
      return Math.ceil(days / 30);
  }
}

/** Line total = rate × units + delivery fee, rounded to cents. */
export function rentalLineAmount(line: Pick<RentalLineInput, 'rateType' | 'rate' | 'deliveryFee'>, days: number): number {
  return Math.round((line.rate * rentalUnits(line.rateType, days) + (line.deliveryFee ?? 0)) * 100) / 100;
}
