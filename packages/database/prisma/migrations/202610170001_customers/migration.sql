BEGIN;
-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "CustomerIdentifierKind" AS ENUM ('TAX', 'NATIONAL');

-- CreateEnum
CREATE TYPE "CustomerAddressType" AS ENUM ('BILLING', 'HEADQUARTERS', 'DELIVERY', 'SITE', 'OTHER');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerNumber" VARCHAR(50) NOT NULL,
    "type" "CustomerType" NOT NULL,
    "displayName" VARCHAR(200) NOT NULL,
    "legalName" VARCHAR(200),
    "taxOffice" VARCHAR(100),
    "identifierCountry" CHAR(2),
    "identifierKind" "CustomerIdentifierKind",
    "identifierValue" VARCHAR(40),
    "primaryEmail" VARCHAR(320),
    "primaryPhone" VARCHAR(40),
    "phoneSearch" VARCHAR(40),
    "notes" VARCHAR(5000),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "title" VARCHAR(100),
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "phoneSearch" VARCHAR(40),
    "notes" VARCHAR(2000),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "CustomerAddressType" NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "region" VARCHAR(100),
    "city" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100),
    "postalCode" VARCHAR(20),
    "line1" VARCHAR(250) NOT NULL,
    "line2" VARCHAR(250),
    "notes" VARCHAR(2000),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_organizationId_active_createdAt_id_idx" ON "Customer"("organizationId", "active", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Customer_organizationId_createdAt_id_idx" ON "Customer"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_id_key" ON "Customer"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_customerNumber_key" ON "Customer"("organizationId", "customerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_identifierCountry_identifierKind_id_key" ON "Customer"("organizationId", "identifierCountry", "identifierKind", "identifierValue");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerContact_organizationId_customerId_id_key" ON "CustomerContact"("organizationId", "customerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAddress_organizationId_customerId_id_key" ON "CustomerAddress"("organizationId", "customerId", "id");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checks and partial unique indexes supplement Prisma's composite tenant foreign keys.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_identifier_complete" CHECK (
  ("identifierCountry" IS NULL AND "identifierKind" IS NULL AND "identifierValue" IS NULL) OR
  ("identifierCountry" IS NOT NULL AND "identifierKind" IS NOT NULL AND "identifierValue" IS NOT NULL
   AND "identifierCountry" ~ '^[A-Z]{2}$' AND "identifierValue" ~ '^[A-Z0-9]{3,40}$'));
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_primary_active" CHECK (NOT "isPrimary" OR active);
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_primary_active" CHECK (NOT "isPrimary" OR active);
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_country" CHECK ("countryCode" ~ '^[A-Z]{2}$');
CREATE UNIQUE INDEX "CustomerContact_one_primary" ON "CustomerContact" ("organizationId", "customerId") WHERE "isPrimary" AND active;
CREATE UNIQUE INDEX "CustomerAddress_one_primary_per_type" ON "CustomerAddress" ("organizationId", "customerId", type) WHERE "isPrimary" AND active;

-- Explicitly approved extension of existing administration templates; never platform roles.
INSERT INTO "Permission" (key,scope) VALUES
 ('customers.read','TENANT'),('customers.create','TENANT'),('customers.update','TENANT'),('customers.archive','TENANT')
ON CONFLICT (key) DO NOTHING;
WITH grants AS (
 INSERT INTO "RolePermission" ("organizationId","roleId","permissionKey","permissionScope")
 SELECT r."organizationId", r.id, p.key, 'TENANT'::"PermissionScope"
 FROM "Role" r CROSS JOIN "Permission" p
 WHERE r."templateKey"='TENANT_ADMINISTRATION' AND p.key IN ('customers.read','customers.create','customers.update','customers.archive')
 ON CONFLICT DO NOTHING
 RETURNING "organizationId","roleId","permissionKey"
)
INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata)
SELECT gen_random_uuid(),"organizationId",'SYSTEM','customer-permissions-migration','ROLE_PERMISSION_GRANTED','Role',"roleId",'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('permission',"permissionKey",'reasonCode','CUSTOMER_TEMPLATE_EXTENSION_APPROVED') FROM grants;

COMMIT;
