BEGIN;
-- CreateEnum
CREATE TYPE "MachineRentalState" AS ENUM ('NOT_RENTED', 'RESERVED', 'RENTED');

-- CreateEnum
CREATE TYPE "MachineServiceState" AS ENUM ('NORMAL', 'MAINTENANCE_DUE', 'MAINTENANCE_REQUIRED', 'OUT_OF_SERVICE', 'SERVICE_BLOCKED');

-- CreateEnum
CREATE TYPE "MachineLifecycleState" AS ENUM ('ACTIVE', 'SOLD', 'RETIRED');

-- CreateEnum
CREATE TYPE "MachineOwnershipType" AS ENUM ('OWNED', 'LEASED', 'THIRD_PARTY');

-- CreateTable
CREATE TABLE "MachineCategory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "key" VARCHAR(200) NOT NULL,

    CONSTRAINT "MachineCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineModel" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "manufacturer" VARCHAR(200) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "manufacturerKey" VARCHAR(200) NOT NULL,
    "nameKey" VARCHAR(200) NOT NULL,

    CONSTRAINT "MachineModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "fleetNumber" VARCHAR(100) NOT NULL,
    "fleetNumberKey" VARCHAR(100) NOT NULL,
    "modelId" UUID NOT NULL,
    "serialNumber" VARCHAR(200),
    "modelYear" INTEGER,
    "acquisitionDate" DATE,
    "acquisitionCost" DECIMAL(30,6),
    "currency" CHAR(3),
    "ownershipType" "MachineOwnershipType",
    "branchId" UUID,
    "notes" VARCHAR(5000),
    "specifications" JSONB NOT NULL DEFAULT '{}',
    "rentalState" "MachineRentalState" NOT NULL DEFAULT 'NOT_RENTED',
    "serviceState" "MachineServiceState" NOT NULL DEFAULT 'NORMAL',
    "lifecycleState" "MachineLifecycleState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MachineCategory_organizationId_id_key" ON "MachineCategory"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MachineCategory_organizationId_key_key" ON "MachineCategory"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "MachineModel_organizationId_id_key" ON "MachineModel"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MachineModel_organizationId_categoryId_manufacturerKey_name_key" ON "MachineModel"("organizationId", "categoryId", "manufacturerKey", "nameKey");

-- CreateIndex
CREATE INDEX "Machine_organizationId_branchId_createdAt_id_idx" ON "Machine"("organizationId", "branchId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Machine_organizationId_lifecycleState_createdAt_id_idx" ON "Machine"("organizationId", "lifecycleState", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_organizationId_id_key" ON "Machine"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_organizationId_fleetNumberKey_key" ON "Machine"("organizationId", "fleetNumberKey");

-- AddForeignKey
ALTER TABLE "MachineCategory" ADD CONSTRAINT "MachineCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineModel" ADD CONSTRAINT "MachineModel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineModel" ADD CONSTRAINT "MachineModel_organizationId_categoryId_fkey" FOREIGN KEY ("organizationId", "categoryId") REFERENCES "MachineCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_organizationId_modelId_fkey" FOREIGN KEY ("organizationId", "modelId") REFERENCES "MachineModel"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Machine" ADD CONSTRAINT "Machine_cost_currency" CHECK (("acquisitionCost" IS NULL AND currency IS NULL) OR ("acquisitionCost" IS NOT NULL AND "acquisitionCost">=0 AND currency IS NOT NULL AND currency ~ '^[A-Z]{3}$'));
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_model_year" CHECK ("modelYear" BETWEEN 1 AND 9999);
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_specifications_object" CHECK (jsonb_typeof(specifications)='object');
-- Explicitly approved extension of existing administration templates; never platform roles.
INSERT INTO "Permission" (key,scope) VALUES
 ('machines.read','TENANT'),('machines.create','TENANT'),('machines.update','TENANT'),('machines.archive','TENANT'),('finance.acquisition_cost.view','TENANT'),('finance.acquisition_cost.edit','TENANT')
ON CONFLICT (key) DO NOTHING;
WITH grants AS (
 INSERT INTO "RolePermission" ("organizationId","roleId","permissionKey","permissionScope")
 SELECT r."organizationId", r.id, p.key, 'TENANT'::"PermissionScope"
 FROM "Role" r CROSS JOIN "Permission" p
 WHERE r."templateKey"='TENANT_ADMINISTRATION' AND p.key IN ('machines.read','machines.create','machines.update','machines.archive','finance.acquisition_cost.view','finance.acquisition_cost.edit')
 ON CONFLICT DO NOTHING
 RETURNING "organizationId","roleId","permissionKey"
)
INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata)
SELECT gen_random_uuid(),"organizationId",'SYSTEM','machine-permissions-migration','ROLE_PERMISSION_GRANTED','Role',"roleId",'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('permission',"permissionKey",'reasonCode','MACHINE_TEMPLATE_EXTENSION_APPROVED') FROM grants;

COMMIT;
