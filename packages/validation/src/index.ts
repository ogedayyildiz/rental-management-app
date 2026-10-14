import { z } from 'zod';

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
