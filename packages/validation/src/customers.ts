import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .default(null);
const email = z
  .union([z.email().max(320), z.literal('')])
  .transform((v) => v.toLowerCase() || null)
  .nullable()
  .default(null);
const phone = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+0-9(). /-]*$/)
  .transform((v) => v || null)
  .nullable()
  .default(null);
const customerBase = z.strictObject({
  type: z.enum(['COMPANY', 'INDIVIDUAL']),
  displayName: z.string().trim().min(1).max(200),
  legalName: optionalText(200),
  taxOffice: optionalText(100),
  identifierCountry: z
    .union([z.string().regex(/^[A-Z]{2}$/), z.literal('')])
    .transform((v) => v || null)
    .nullable()
    .default(null),
  identifierKind: z.enum(['TAX', 'NATIONAL']).nullable().default(null),
  identifierValue: z
    .union([
      z
        .string()
        .trim()
        .min(3)
        .max(40)
        .regex(/^[A-Za-z0-9 .-]+$/),
      z.literal(''),
    ])
    .transform((v) => v.replace(/[ .-]/g, '').toUpperCase() || null)
    .refine((v) => v === null || v.length >= 3)
    .nullable()
    .default(null),
  primaryEmail: email,
  primaryPhone: phone,
  notes: optionalText(5000),
});
export const customerFieldsSchema = customerBase.refine(
  (v) =>
    [v.identifierCountry, v.identifierKind, v.identifierValue].every(
      (x) => x === null,
    ) ||
    [v.identifierCountry, v.identifierKind, v.identifierValue].every(
      (x) => x !== null,
    ),
  {
    path: ['identifierValue'],
    message: 'Provide identifier country, kind and value together',
  },
);

// PATCH validates the merged record as well as supplied fields in the application service.
export const customerPatchSchema = z
  .strictObject({
    type: customerBase.shape.type.optional(),
    displayName: customerBase.shape.displayName.optional(),
    legalName: customerBase.shape.legalName.removeDefault().optional(),
    taxOffice: customerBase.shape.taxOffice.removeDefault().optional(),
    identifierCountry: customerBase.shape.identifierCountry
      .removeDefault()
      .optional(),
    identifierKind: customerBase.shape.identifierKind
      .removeDefault()
      .optional(),
    identifierValue: customerBase.shape.identifierValue
      .removeDefault()
      .optional(),
    primaryEmail: customerBase.shape.primaryEmail.removeDefault().optional(),
    primaryPhone: customerBase.shape.primaryPhone.removeDefault().optional(),
    notes: customerBase.shape.notes.removeDefault().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
const contactBase = z.strictObject({
  name: z.string().trim().min(1).max(200),
  title: optionalText(100),
  email,
  phone,
  notes: optionalText(2000),
  isPrimary: z.boolean().default(false),
  active: z.boolean().default(true),
});
export const customerContactSchema = contactBase.refine(
  (v) => !v.isPrimary || v.active,
  { path: ['isPrimary'], message: 'Primary contact must be active' },
);
export const customerContactPatchSchema = z
  .strictObject({
    name: contactBase.shape.name.optional(),
    title: contactBase.shape.title.removeDefault().optional(),
    email: contactBase.shape.email.removeDefault().optional(),
    phone: contactBase.shape.phone.removeDefault().optional(),
    notes: contactBase.shape.notes.removeDefault().optional(),
    isPrimary: contactBase.shape.isPrimary.removeDefault().optional(),
    active: contactBase.shape.active.removeDefault().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
const addressBase = z.strictObject({
  type: z.enum(['BILLING', 'HEADQUARTERS', 'DELIVERY', 'SITE', 'OTHER']),
  label: z.string().trim().min(1).max(100),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  region: optionalText(100),
  city: z.string().trim().min(1).max(100),
  district: optionalText(100),
  postalCode: optionalText(20),
  line1: z.string().trim().min(1).max(250),
  line2: optionalText(250),
  notes: optionalText(2000),
  isPrimary: z.boolean().default(false),
  active: z.boolean().default(true),
});
export const customerAddressSchema = addressBase.refine(
  (v) => !v.isPrimary || v.active,
  { path: ['isPrimary'], message: 'Primary address must be active' },
);
export const customerAddressPatchSchema = z
  .strictObject({
    type: addressBase.shape.type.optional(),
    label: addressBase.shape.label.optional(),
    countryCode: addressBase.shape.countryCode.optional(),
    city: addressBase.shape.city.optional(),
    line1: addressBase.shape.line1.optional(),
    region: addressBase.shape.region.removeDefault().optional(),
    district: addressBase.shape.district.removeDefault().optional(),
    postalCode: addressBase.shape.postalCode.removeDefault().optional(),
    line2: addressBase.shape.line2.removeDefault().optional(),
    notes: addressBase.shape.notes.removeDefault().optional(),
    isPrimary: addressBase.shape.isPrimary.removeDefault().optional(),
    active: addressBase.shape.active.removeDefault().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const customerCursorSchema = z.string().refine((v) => {
  const [time, id, ...extra] = v.split('|');
  return (
    !extra.length &&
    z.iso.datetime({ precision: 3 }).safeParse(time).success &&
    z.uuid().safeParse(id).success
  );
});
export const customerSearchSchema = z.strictObject({
  q: z.string().trim().max(100).default(''),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: customerCursorSchema.optional(),
});
export type CustomerInput = z.output<typeof customerFieldsSchema>;
export type ContactInput = z.output<typeof customerContactSchema>;
export type AddressInput = z.output<typeof customerAddressSchema>;
export type CustomerSearch = z.output<typeof customerSearchSchema>;
export interface CustomerView extends CustomerInput {
  id: string;
  organizationId: string;
  customerNumber: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  updatedById: string;
}
export interface ContactView extends ContactInput {
  id: string;
  customerId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}
export interface AddressView extends AddressInput {
  id: string;
  customerId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}
export interface CustomerPage {
  items: CustomerView[];
  nextCursor: string | null;
}

const timestamps = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
export const customerViewSchema = customerBase.extend({
  id: z.uuid(),
  organizationId: z.uuid(),
  customerNumber: z.string(),
  active: z.boolean(),
  createdById: z.uuid(),
  updatedById: z.uuid(),
  ...timestamps,
});
export const contactViewSchema = contactBase.extend({
  id: z.uuid(),
  organizationId: z.uuid(),
  customerId: z.uuid(),
  ...timestamps,
});
export const addressViewSchema = addressBase.extend({
  id: z.uuid(),
  organizationId: z.uuid(),
  customerId: z.uuid(),
  ...timestamps,
});
export const customerPageSchema = z.strictObject({
  items: z.array(customerViewSchema),
  nextCursor: customerCursorSchema.nullable(),
});
export const contactListSchema = z.array(contactViewSchema);
export const addressListSchema = z.array(addressViewSchema);
export const customerAccessSchema = z.object({
  organizations: z.array(
    z.object({
      name: z.string(),
      access: z
        .object({ organizationId: z.uuid(), permissions: z.array(z.string()) })
        .nullable(),
    }),
  ),
});
