BEGIN;
-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('DRAFT', 'QUOTED', 'RESERVED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RentalRateUnit" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'FIXED_PERIOD', 'MANUAL');

-- CreateTable
CREATE TABLE "RentalCounter" (
    "organizationId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "RentalCounter_pkey" PRIMARY KEY ("organizationId","year")
);

-- CreateTable
CREATE TABLE "Rental" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "customerId" UUID NOT NULL,
    "branchId" UUID,
    "status" "RentalStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" VARCHAR(5000),
    "plannedStartAt" TIMESTAMPTZ(3),
    "plannedEndAt" TIMESTAMPTZ(3),
    "actualStartAt" TIMESTAMPTZ(3),
    "actualEndAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "rentalId" UUID NOT NULL,
    "requestedCategoryId" UUID,
    "requestedModelId" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "specifications" JSONB NOT NULL DEFAULT '{}',
    "plannedStartAt" TIMESTAMPTZ(3),
    "plannedEndAt" TIMESTAMPTZ(3),
    "agreedRate" DECIMAL(30,6),
    "rateUnit" "RentalRateUnit",
    "currency" CHAR(3),
    "commercialNotes" VARCHAR(2000),
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RentalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalMachineAssignment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMPTZ(3),
    "actualStartAt" TIMESTAMPTZ(3),
    "actualEndAt" TIMESTAMPTZ(3),
    "reason" VARCHAR(1000),

    CONSTRAINT "RentalMachineAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalItemTerm" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "plannedStartAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedEndAt" TIMESTAMPTZ(3) NOT NULL,
    "agreedRate" DECIMAL(30,6) NOT NULL,
    "rateUnit" "RentalRateUnit" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "agreedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID NOT NULL,

    CONSTRAINT "RentalItemTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rental_organizationId_branchId_status_createdAt_id_idx" ON "Rental"("organizationId", "branchId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Rental_organizationId_customerId_createdAt_id_idx" ON "Rental"("organizationId", "customerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Rental_organizationId_plannedStartAt_plannedEndAt_idx" ON "Rental"("organizationId", "plannedStartAt", "plannedEndAt");

-- CreateIndex
CREATE UNIQUE INDEX "Rental_organizationId_id_key" ON "Rental"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Rental_organizationId_number_key" ON "Rental"("organizationId", "number");

-- CreateIndex
CREATE INDEX "RentalItem_organizationId_rentalId_removedAt_idx" ON "RentalItem"("organizationId", "rentalId", "removedAt");

-- CreateIndex
CREATE INDEX "RentalItem_organizationId_plannedStartAt_plannedEndAt_idx" ON "RentalItem"("organizationId", "plannedStartAt", "plannedEndAt");

-- CreateIndex
CREATE UNIQUE INDEX "RentalItem_organizationId_id_key" ON "RentalItem"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RentalItem_organizationId_rentalId_id_key" ON "RentalItem"("organizationId", "rentalId", "id");

-- CreateIndex
CREATE INDEX "RentalMachineAssignment_organizationId_machineId_releasedAt_idx" ON "RentalMachineAssignment"("organizationId", "machineId", "releasedAt", "actualStartAt", "actualEndAt");

-- CreateIndex
CREATE INDEX "RentalMachineAssignment_organizationId_itemId_idx" ON "RentalMachineAssignment"("organizationId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RentalMachineAssignment_organizationId_id_key" ON "RentalMachineAssignment"("organizationId", "id");

-- CreateIndex
CREATE INDEX "RentalItemTerm_organizationId_itemId_agreedAt_idx" ON "RentalItemTerm"("organizationId", "itemId", "agreedAt");

-- AddForeignKey
ALTER TABLE "RentalCounter" ADD CONSTRAINT "RentalCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_organizationId_rentalId_fkey" FOREIGN KEY ("organizationId", "rentalId") REFERENCES "Rental"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_organizationId_requestedCategoryId_fkey" FOREIGN KEY ("organizationId", "requestedCategoryId") REFERENCES "MachineCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_organizationId_requestedModelId_fkey" FOREIGN KEY ("organizationId", "requestedModelId") REFERENCES "MachineModel"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalMachineAssignment" ADD CONSTRAINT "RentalMachineAssignment_organizationId_itemId_fkey" FOREIGN KEY ("organizationId", "itemId") REFERENCES "RentalItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalMachineAssignment" ADD CONSTRAINT "RentalMachineAssignment_organizationId_machineId_fkey" FOREIGN KEY ("organizationId", "machineId") REFERENCES "Machine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalItemTerm" ADD CONSTRAINT "RentalItemTerm_organizationId_itemId_fkey" FOREIGN KEY ("organizationId", "itemId") REFERENCES "RentalItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_period" CHECK (("plannedStartAt" IS NULL AND "plannedEndAt" IS NULL) OR ("plannedStartAt" IS NOT NULL AND "plannedEndAt" IS NOT NULL AND "plannedEndAt">"plannedStartAt"));
ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_quantity" CHECK (quantity>0);
ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_money" CHECK (("agreedRate" IS NULL AND "rateUnit" IS NULL AND currency IS NULL) OR ("agreedRate" IS NOT NULL AND "agreedRate">=0 AND "rateUnit" IS NOT NULL AND currency IS NOT NULL AND currency ~ '^[A-Z]{3}$'));
ALTER TABLE "RentalItemTerm" ADD CONSTRAINT "RentalItemTerm_period_money" CHECK ("plannedEndAt">"plannedStartAt" AND "agreedRate">=0 AND currency ~ '^[A-Z]{3}$');
ALTER TABLE "RentalMachineAssignment" ADD CONSTRAINT "RentalMachineAssignment_actual_period" CHECK ("actualEndAt" IS NULL OR ("actualStartAt" IS NOT NULL AND "actualEndAt">="actualStartAt"));
CREATE UNIQUE INDEX "RentalMachineAssignment_one_open_rental" ON "RentalMachineAssignment" ("organizationId","machineId") WHERE "actualStartAt" IS NOT NULL AND "actualEndAt" IS NULL AND "releasedAt" IS NULL;
INSERT INTO "Permission" (key,scope) VALUES ('rentals.read','TENANT'),('rentals.create','TENANT'),('rentals.update','TENANT'),('rentals.reserve','TENANT'),('rentals.dispatch','TENANT'),('rentals.return','TENANT'),('rentals.cancel','TENANT'),('rentals.extend','TENANT'),('rentals.pricing.view','TENANT'),('rentals.pricing.edit','TENANT') ON CONFLICT DO NOTHING;
WITH grants AS (
 INSERT INTO "RolePermission" ("organizationId","roleId","permissionKey","permissionScope") SELECT r."organizationId",r.id,p.key,'TENANT'::"PermissionScope" FROM "Role" r CROSS JOIN "Permission" p WHERE r."templateKey"='TENANT_ADMINISTRATION' AND p.key IN ('rentals.read','rentals.create','rentals.update','rentals.reserve','rentals.dispatch','rentals.return','rentals.cancel','rentals.extend','rentals.pricing.view','rentals.pricing.edit') ON CONFLICT DO NOTHING RETURNING "organizationId","roleId","permissionKey"
)
INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata) SELECT gen_random_uuid(),"organizationId",'SYSTEM','rental-permissions-migration','ROLE_PERMISSION_GRANTED','Role',"roleId",'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('permission',"permissionKey",'reasonCode','RENTAL_TEMPLATE_EXTENSION_APPROVED') FROM grants;
ALTER TABLE "RentalItemTerm" ADD CONSTRAINT "RentalItemTerm_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_actual_period" CHECK ("actualEndAt" IS NULL OR ("actualStartAt" IS NOT NULL AND "actualEndAt">="actualStartAt"));
COMMIT;
