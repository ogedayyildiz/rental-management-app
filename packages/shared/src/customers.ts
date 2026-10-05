import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const customerInputSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  taxNo: optionalText(40),
  address: optionalText(500),
  contactName: optionalText(120),
  phone: optionalText(40),
  email: z.union([z.literal(''), z.email()]).optional(),
  notes: optionalText(2000),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;
