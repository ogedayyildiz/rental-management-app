import { z } from 'zod';
const id = z.uuid(),
  name = z.string().trim().min(1).max(200),
  ids = z
    .array(id)
    .max(100)
    .refine((a) => new Set(a).size === a.length);
const timestamp = z.iso.datetime({ offset: true });
export const organizationSettingsSchema = z.strictObject({
  name,
  legalName: z.string().trim().max(200).nullable(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  defaultLanguage: z.enum(['en', 'tr']),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
});
export const organizationSettingsUpdateSchema = organizationSettingsSchema
  .partial()
  .extend({ version: timestamp })
  .refine((v) => Object.keys(v).length > 1);
export const organizationSettingsViewSchema = organizationSettingsSchema.extend(
  { id, updatedAt: timestamp },
);
export const adminRoleInputSchema = z.strictObject({
  name,
  permissions: z
    .array(z.string().min(1).max(100))
    .max(200)
    .refine((a) => new Set(a).size === a.length),
});
export const adminRoleUpdateSchema = adminRoleInputSchema
  .partial()
  .extend({ enabled: z.boolean().optional(), version: timestamp })
  .refine((v) => Object.keys(v).length > 1);
export const adminRoleSchema = adminRoleInputSchema.extend({
  id,
  enabled: z.boolean(),
  templateKey: z.string().nullable(),
  updatedAt: timestamp,
  memberCount: z.number(),
  pendingInvitationCount: z.number(),
});
export const adminMemberUpdateSchema = z
  .strictObject({
    version: timestamp,
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    roleIds: ids.optional(),
    branchScope: z.enum(['ALL_BRANCHES', 'SELECTED_BRANCHES']).optional(),
    branchIds: ids.optional(),
  })
  .refine((v) => Object.keys(v).length > 1);
export const adminMemberSchema = z.object({
  id,
  userId: id,
  name: z.string(),
  email: z.string(),
  userStatus: z.enum(['ACTIVE', 'DISABLED']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  branchScope: z.enum(['ALL_BRANCHES', 'SELECTED_BRANCHES']),
  roleIds: ids,
  branchIds: ids,
  updatedAt: timestamp,
});
export const adminBranchCreateSchema = z.strictObject({ name });
export const adminBranchSchema = z.object({
  id,
  organizationId: id,
  name,
  active: z.boolean(),
  updatedAt: timestamp.optional(),
  memberCount: z.number().optional(),
});
export const adminQuerySchema = z
  .strictObject({
    q: z.string().trim().max(200).optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    roleId: id.optional(),
    branchId: id.optional(),
    status: z
      .enum(['ACTIVE', 'INACTIVE', 'PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'])
      .optional(),
    from: timestamp.optional(),
    to: timestamp.optional(),
    actorId: id.optional(),
    action: z
      .string()
      .regex(/^[A-Z_]+$/)
      .max(100)
      .optional(),
    targetType: z
      .string()
      .regex(/^[A-Za-z]+$/)
      .max(100)
      .optional(),
    domain: z
      .enum([
        'ADMINISTRATION',
        'CUSTOMERS',
        'MACHINES',
        'RENTALS',
        'MAINTENANCE',
        'TELEMETRY',
      ])
      .optional(),
  })
  .refine((v) => !v.from || !v.to || Date.parse(v.to) > Date.parse(v.from));
export const adminInvitationSchema = z.object({
  id,
  email: z.email(),
  status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']),
  branchScope: z.enum(['ALL_BRANCHES', 'SELECTED_BRANCHES']),
  roleIds: ids,
  branchIds: ids,
  createdAt: timestamp,
  expiresAt: timestamp,
  acceptedAt: timestamp.nullable(),
});
export const issuedInvitationSchema = z.object({
  invitationId: id,
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: timestamp,
});
export const adminAuditStateSchema = z.strictObject({
  roleIds: ids.optional(),
  branchIds: ids.optional(),
  branchScope: z.enum(['ALL_BRANCHES', 'SELECTED_BRANCHES']).optional(),
  permissions: z.array(z.string().max(100)).max(200).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  enabled: z.boolean().optional(),
});
export const adminAuditMetadataSchema = z.strictObject({
  changes: z
    .array(
      z
        .string()
        .regex(/^[a-zA-Z]+$/)
        .max(50),
    )
    .max(20),
  before: adminAuditStateSchema.optional(),
  after: adminAuditStateSchema.optional(),
});
export const adminAuditSchema = z.object({
  id,
  actorUserId: id.nullable(),
  actorName: z.string().nullable(),
  actorType: z.enum(['USER', 'SYSTEM']),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  timestamp,
  result: z.string(),
  changes: z.array(z.string()),
});
export const adminPermissionsSchema = z.array(
  z.object({
    key: z.string(),
    group: z.string(),
    sensitive: z.boolean(),
    grantable: z.boolean(),
  }),
);
export const adminRolePageSchema = z.object({
  items: z.array(adminRoleSchema),
  nextCursor: id.nullable(),
});
export const adminMemberPageSchema = z.object({
  items: z.array(adminMemberSchema),
  nextCursor: id.nullable(),
});
export const adminBranchPageSchema = z.object({
  items: z.array(adminBranchSchema),
  nextCursor: id.nullable(),
});
export const adminInvitationPageSchema = z.object({
  items: z.array(adminInvitationSchema),
  nextCursor: id.nullable(),
});
export const adminAuditPageSchema = z.object({
  items: z.array(adminAuditSchema),
  nextCursor: id.nullable(),
});
export type AdminQuery = z.infer<typeof adminQuerySchema>;
export type AdminRole = z.infer<typeof adminRoleSchema>;
export type AdminMember = z.infer<typeof adminMemberSchema>;
export type AdminInvitation = z.infer<typeof adminInvitationSchema>;
export type AdminAudit = z.infer<typeof adminAuditSchema>;
export type OrganizationSettings = z.infer<
  typeof organizationSettingsViewSchema
>;
export type AdminBranch = z.infer<typeof adminBranchSchema>;
export type AdminRoleInput = z.infer<typeof adminRoleInputSchema>;
export type AdminMemberUpdate = z.infer<typeof adminMemberUpdateSchema>;
export type AdminMetadata = z.infer<typeof adminAuditMetadataSchema>;

export const administrationAccountSchema = z.object({
  id,
  name: z.string(),
  email: z.string(),
  organizations: z.array(
    z.object({
      name: z.string(),
      access: z
        .object({
          organizationId: id,
          membershipId: id,
          userId: id,
          branchScope: z.enum(['ALL_BRANCHES', 'SELECTED_BRANCHES']),
          branchIds: z.array(id),
          permissions: z.array(z.string()),
        })
        .nullable(),
    }),
  ),
  platformPermissions: z.array(z.string()),
});
