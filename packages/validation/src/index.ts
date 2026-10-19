import { z } from 'zod';
export * from './customers.js';

export const identifierSchema = z.uuid();
export const databaseUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname.length > 0
    );
  });
export const externalIdentitySchema = z.strictObject({
  issuer: z.string().url().max(2048),
  subject: z.string().min(1).max(255),
});
export const branchUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
});

export const invitationEmailSchema = z
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const invitationAcceptanceSchema = z.strictObject({
  token: invitationTokenSchema,
});
export const invitationCreateSchema = z
  .strictObject({
    email: invitationEmailSchema,
    roleIds: z
      .array(identifierSchema)
      .min(1)
      .max(30)
      .refine((ids) => new Set(ids).size === ids.length),
    branchScope: z.enum(['ALL_BRANCHES', 'SELECTED_BRANCHES']),
    branchIds: z
      .array(identifierSchema)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .refine(
    (value) =>
      value.branchScope !== 'ALL_BRANCHES' || value.branchIds.length === 0,
  );
export const organizationCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  defaultLanguage: z.enum(['en', 'tr']),
  timezone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
  email: invitationEmailSchema,
});

// Explicit allowlist: do not persist arbitrary request bodies, headers or secrets.
export const auditMetadataSchema = z.strictObject({
  before: z.strictObject({ name: z.string().max(200) }).optional(),
  after: z.strictObject({ name: z.string().max(200) }).optional(),
  permission: z.string().max(100).optional(),
  reasonCode: z
    .string()
    .regex(/^[A-Z_]+$/)
    .max(100)
    .optional(),
});
export * from './machines.js';
