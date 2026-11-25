BEGIN;
-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'OPEN', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceImpact" AS ENUM ('INFORMATIONAL', 'WARNING', 'RENTAL_BLOCKING', 'SAFETY_CRITICAL');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MaintenanceIntervalUnit" AS ENUM ('DAYS', 'MONTHS');

-- CreateEnum
CREATE TYPE "MaintenanceIntervalBasis" AS ENUM ('COMPLETION', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "MaintenanceCostKind" AS ENUM ('LABOR', 'PARTS', 'EXTERNAL_SERVICE', 'TRANSPORT', 'OTHER');

-- CreateTable
CREATE TABLE "MaintenanceCounter" (
    "organizationId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "MaintenanceCounter_pkey" PRIMARY KEY ("organizationId","year")
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "description" VARCHAR(5000),
    "interval" INTEGER NOT NULL,
    "intervalUnit" "MaintenanceIntervalUnit" NOT NULL,
    "intervalBasis" "MaintenanceIntervalBasis" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "impact" "MaintenanceImpact" NOT NULL DEFAULT 'WARNING',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MachineMaintenancePlan" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "nextDueAt" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MachineMaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "branchId" UUID,
    "assignedMembershipId" UUID,
    "machinePlanId" UUID,
    "number" VARCHAR(40) NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "impact" "MaintenanceImpact" NOT NULL DEFAULT 'INFORMATIONAL',
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(5000),
    "diagnosis" VARCHAR(5000),
    "technicianNotes" VARCHAR(5000),
    "completionNotes" VARCHAR(5000),
    "cancellationReason" VARCHAR(1000),
    "externalProvider" VARCHAR(200),
    "serviceLocation" VARCHAR(200),
    "plannedAt" TIMESTAMPTZ(3),
    "plannedEndAt" TIMESTAMPTZ(3),
    "dueAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderTask" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "notes" VARCHAR(2000),
    "completedAt" TIMESTAMPTZ(3),
    "completedById" UUID,

    CONSTRAINT "WorkOrderTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderMaterial" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "partNumber" VARCHAR(200),
    "quantity" DECIMAL(30,6) NOT NULL,
    "unit" VARCHAR(40) NOT NULL,

    CONSTRAINT "WorkOrderMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderCost" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "kind" "MaintenanceCostKind" NOT NULL,
    "amount" DECIMAL(30,6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" VARCHAR(1000),

    CONSTRAINT "WorkOrderCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRestriction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "workOrderId" UUID,
    "state" "MachineServiceState" NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "releasedAt" TIMESTAMPTZ(3),
    "releasedById" UUID,
    "releaseReason" VARCHAR(1000),

    CONSTRAINT "ServiceRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenancePlan_organizationId_active_idx" ON "MaintenancePlan"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePlan_organizationId_id_key" ON "MaintenancePlan"("organizationId", "id");

-- CreateIndex
CREATE INDEX "MachineMaintenancePlan_organizationId_nextDueAt_idx" ON "MachineMaintenancePlan"("organizationId", "nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "MachineMaintenancePlan_organizationId_id_key" ON "MachineMaintenancePlan"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MachineMaintenancePlan_organizationId_machineId_planId_key" ON "MachineMaintenancePlan"("organizationId", "machineId", "planId");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_machineId_status_idx" ON "WorkOrder"("organizationId", "machineId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_branchId_status_createdAt_id_idx" ON "WorkOrder"("organizationId", "branchId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_dueAt_idx" ON "WorkOrder"("organizationId", "dueAt");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_plannedAt_plannedEndAt_idx" ON "WorkOrder"("organizationId", "plannedAt", "plannedEndAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_organizationId_id_key" ON "WorkOrder"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_organizationId_number_key" ON "WorkOrder"("organizationId", "number");

-- CreateIndex
CREATE INDEX "WorkOrderTask_organizationId_workOrderId_idx" ON "WorkOrderTask"("organizationId", "workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderTask_organizationId_id_key" ON "WorkOrderTask"("organizationId", "id");

-- CreateIndex
CREATE INDEX "WorkOrderMaterial_organizationId_workOrderId_idx" ON "WorkOrderMaterial"("organizationId", "workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderMaterial_organizationId_id_key" ON "WorkOrderMaterial"("organizationId", "id");

-- CreateIndex
CREATE INDEX "WorkOrderCost_organizationId_workOrderId_idx" ON "WorkOrderCost"("organizationId", "workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderCost_organizationId_id_key" ON "WorkOrderCost"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ServiceRestriction_organizationId_machineId_releasedAt_idx" ON "ServiceRestriction"("organizationId", "machineId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRestriction_organizationId_id_key" ON "ServiceRestriction"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "MaintenanceCounter" ADD CONSTRAINT "MaintenanceCounter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineMaintenancePlan" ADD CONSTRAINT "MachineMaintenancePlan_organizationId_machineId_fkey" FOREIGN KEY ("organizationId", "machineId") REFERENCES "Machine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineMaintenancePlan" ADD CONSTRAINT "MachineMaintenancePlan_organizationId_planId_fkey" FOREIGN KEY ("organizationId", "planId") REFERENCES "MaintenancePlan"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_machineId_fkey" FOREIGN KEY ("organizationId", "machineId") REFERENCES "Machine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_assignedMembershipId_fkey" FOREIGN KEY ("organizationId", "assignedMembershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_machinePlanId_fkey" FOREIGN KEY ("organizationId", "machinePlanId") REFERENCES "MachineMaintenancePlan"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderTask" ADD CONSTRAINT "WorkOrderTask_organizationId_workOrderId_fkey" FOREIGN KEY ("organizationId", "workOrderId") REFERENCES "WorkOrder"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderTask" ADD CONSTRAINT "WorkOrderTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderMaterial" ADD CONSTRAINT "WorkOrderMaterial_organizationId_workOrderId_fkey" FOREIGN KEY ("organizationId", "workOrderId") REFERENCES "WorkOrder"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderCost" ADD CONSTRAINT "WorkOrderCost_organizationId_workOrderId_fkey" FOREIGN KEY ("organizationId", "workOrderId") REFERENCES "WorkOrder"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRestriction" ADD CONSTRAINT "ServiceRestriction_organizationId_machineId_fkey" FOREIGN KEY ("organizationId", "machineId") REFERENCES "Machine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRestriction" ADD CONSTRAINT "ServiceRestriction_organizationId_workOrderId_fkey" FOREIGN KEY ("organizationId", "workOrderId") REFERENCES "WorkOrder"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRestriction" ADD CONSTRAINT "ServiceRestriction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRestriction" ADD CONSTRAINT "ServiceRestriction_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_interval_positive" CHECK (interval>0);
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_planned_period" CHECK ("plannedEndAt" IS NULL OR ("plannedAt" IS NOT NULL AND "plannedEndAt">"plannedAt"));
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_actual_period" CHECK ("completedAt" IS NULL OR ("startedAt" IS NOT NULL AND "completedAt">="startedAt"));
ALTER TABLE "WorkOrderMaterial" ADD CONSTRAINT "WorkOrderMaterial_quantity_positive" CHECK (quantity>0);
ALTER TABLE "WorkOrderCost" ADD CONSTRAINT "WorkOrderCost_money" CHECK (amount>=0 AND currency ~ '^[A-Z]{3}$');
ALTER TABLE "ServiceRestriction" ADD CONSTRAINT "ServiceRestriction_not_normal" CHECK (state<>'NORMAL');
CREATE UNIQUE INDEX "WorkOrder_one_open_plan" ON "WorkOrder" ("organizationId","machinePlanId") WHERE "machinePlanId" IS NOT NULL AND status NOT IN ('COMPLETED','CANCELLED');
INSERT INTO "ServiceRestriction" (id,"organizationId","machineId",state,reason,"createdAt") SELECT gen_random_uuid(),"organizationId",id,"serviceState",'Existing manual service state preserved by maintenance migration',now() FROM "Machine" WHERE "serviceState"<>'NORMAL';
INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata) SELECT gen_random_uuid(),"organizationId",'SYSTEM','maintenance-migration','MAINTENANCE_BLOCK_PRESERVED','ServiceRestriction',id,'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('nextState',state) FROM "ServiceRestriction";
INSERT INTO "Permission" (key,scope) VALUES ('maintenance.read','TENANT'),('maintenance.create','TENANT'),('maintenance.update','TENANT'),('maintenance.schedule','TENANT'),('maintenance.start','TENANT'),('maintenance.complete','TENANT'),('maintenance.cancel','TENANT'),('maintenance.block_machine','TENANT'),('maintenance.release_machine','TENANT'),('maintenance.plans.manage','TENANT'),('maintenance.costs.view','TENANT'),('maintenance.costs.edit','TENANT'),('maintenance.export','TENANT') ON CONFLICT DO NOTHING;
WITH grants AS (INSERT INTO "RolePermission" ("organizationId","roleId","permissionKey","permissionScope") SELECT r."organizationId",r.id,p.key,'TENANT'::"PermissionScope" FROM "Role" r CROSS JOIN "Permission" p WHERE r."templateKey"='TENANT_ADMINISTRATION' AND p.key IN ('maintenance.read','maintenance.create','maintenance.update','maintenance.schedule','maintenance.start','maintenance.complete','maintenance.cancel','maintenance.block_machine','maintenance.release_machine','maintenance.plans.manage','maintenance.costs.view','maintenance.costs.edit','maintenance.export') ON CONFLICT DO NOTHING RETURNING "organizationId","roleId","permissionKey") INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata) SELECT gen_random_uuid(),"organizationId",'SYSTEM','maintenance-permissions-migration','ROLE_PERMISSION_GRANTED','Role',"roleId",'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('permission',"permissionKey",'reasonCode','MAINTENANCE_TEMPLATE_EXTENSION_APPROVED') FROM grants;

ALTER TABLE "WorkOrder" ADD COLUMN "planSnapshot" JSONB;
COMMIT;
