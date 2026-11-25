BEGIN;
-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('UNSPECIFIED', 'EXCLUSIVE', 'INCLUSIVE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "FinanceRecordKind" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "FinanceRecordStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AcquisitionMethod" AS ENUM ('CASH', 'OPEN_ACCOUNT', 'LEASING');

-- CreateEnum
CREATE TYPE "FinanceDocumentStatus" AS ENUM ('NONE', 'PENDING', 'RECORDED', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancePaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "FinanceInstallmentKind" AS ENUM ('DEPOSIT', 'INSTALLMENT', 'DUE');

-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "taxMode" "TaxMode" NOT NULL DEFAULT 'UNSPECIFIED',
ADD COLUMN     "taxRate" DECIMAL(9,6),
ADD COLUMN     "taxReason" VARCHAR(1000);

-- AlterTable
ALTER TABLE "RentalItem" ADD COLUMN     "taxMode" "TaxMode" NOT NULL DEFAULT 'UNSPECIFIED',
ADD COLUMN     "taxRate" DECIMAL(9,6),
ADD COLUMN     "taxReason" VARCHAR(1000);

-- AlterTable
ALTER TABLE "RentalItemTerm" ADD COLUMN     "taxMode" "TaxMode" NOT NULL DEFAULT 'UNSPECIFIED',
ADD COLUMN     "taxRate" DECIMAL(9,6),
ADD COLUMN     "taxReason" VARCHAR(1000);

-- AlterTable
ALTER TABLE "WorkOrderCost" ADD COLUMN     "taxMode" "TaxMode" NOT NULL DEFAULT 'UNSPECIFIED',
ADD COLUMN     "taxRate" DECIMAL(9,6),
ADD COLUMN     "taxReason" VARCHAR(1000);

-- CreateTable
CREATE TABLE "FinanceRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "FinanceRecordKind" NOT NULL,
    "status" "FinanceRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(200) NOT NULL,
    "customerId" UUID,
    "machineId" UUID,
    "rentalId" UUID,
    "branchId" UUID,
    "acquisitionMethod" "AcquisitionMethod",
    "counterpartyName" VARCHAR(200),
    "occurredOn" DATE NOT NULL,
    "amount" DECIMAL(30,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "taxMode" "TaxMode" NOT NULL,
    "taxRate" DECIMAL(9,6),
    "taxReason" VARCHAR(1000),
    "netAmount" DECIMAL(30,2) NOT NULL,
    "taxAmount" DECIMAL(30,2) NOT NULL,
    "grossAmount" DECIMAL(30,2) NOT NULL,
    "documentStatus" "FinanceDocumentStatus" NOT NULL DEFAULT 'NONE',
    "documentReference" VARCHAR(200),
    "notes" VARCHAR(5000),
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmedById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,

    CONSTRAINT "FinanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceInstallment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "kind" "FinanceInstallmentKind" NOT NULL,
    "dueOn" DATE NOT NULL,
    "amount" DECIMAL(30,2) NOT NULL,

    CONSTRAINT "FinanceInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancePayment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "installmentId" UUID NOT NULL,
    "idempotencyKey" UUID NOT NULL,
    "amount" DECIMAL(30,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" "FinancePaymentMethod" NOT NULL,
    "reference" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "reversedAt" TIMESTAMPTZ(3),
    "reversedById" UUID,
    "reversalReason" VARCHAR(1000),

    CONSTRAINT "FinancePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceRecord_organizationId_kind_status_createdAt_id_idx" ON "FinanceRecord"("organizationId", "kind", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "FinanceRecord_organizationId_customerId_idx" ON "FinanceRecord"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "FinanceRecord_organizationId_machineId_idx" ON "FinanceRecord"("organizationId", "machineId");

-- CreateIndex
CREATE INDEX "FinanceRecord_organizationId_branchId_idx" ON "FinanceRecord"("organizationId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceRecord_organizationId_id_key" ON "FinanceRecord"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceRecord_organizationId_id_currency_key" ON "FinanceRecord"("organizationId", "id", "currency");

-- CreateIndex
CREATE INDEX "FinanceInstallment_organizationId_dueOn_idx" ON "FinanceInstallment"("organizationId", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceInstallment_organizationId_recordId_id_key" ON "FinanceInstallment"("organizationId", "recordId", "id");

-- CreateIndex
CREATE INDEX "FinancePayment_organizationId_recordId_reversedAt_idx" ON "FinancePayment"("organizationId", "recordId", "reversedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePayment_organizationId_id_key" ON "FinancePayment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FinancePayment_organizationId_idempotencyKey_key" ON "FinancePayment"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Rental_organizationId_id_customerId_key" ON "Rental"("organizationId", "id", "customerId");

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_organizationId_customerId_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_organizationId_machineId_fkey" FOREIGN KEY ("organizationId", "machineId") REFERENCES "Machine"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_organizationId_rentalId_customerId_fkey" FOREIGN KEY ("organizationId", "rentalId", "customerId") REFERENCES "Rental"("organizationId", "id", "customerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInstallment" ADD CONSTRAINT "FinanceInstallment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceInstallment" ADD CONSTRAINT "FinanceInstallment_organizationId_recordId_fkey" FOREIGN KEY ("organizationId", "recordId") REFERENCES "FinanceRecord"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_organizationId_recordId_currency_fkey" FOREIGN KEY ("organizationId", "recordId", "currency") REFERENCES "FinanceRecord"("organizationId", "id", "currency") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_organizationId_recordId_installmentId_fkey" FOREIGN KEY ("organizationId", "recordId", "installmentId") REFERENCES "FinanceInstallment"("organizationId", "recordId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Machine" ADD CONSTRAINT "Machine_tax_terms" CHECK (
 ("taxMode"='UNSPECIFIED' AND "taxRate" IS NULL AND "taxReason" IS NULL)
 OR ("taxMode" IN ('EXCLUSIVE','INCLUSIVE') AND "taxRate" IS NOT NULL AND "taxRate">=0 AND "taxReason" IS NULL)
 OR ("taxMode"='NOT_APPLICABLE' AND "taxRate" IS NULL AND "taxReason" IS NOT NULL AND length(trim("taxReason"))>0)
);

ALTER TABLE "RentalItem" ADD CONSTRAINT "RentalItem_tax_terms" CHECK (
 ("taxMode"='UNSPECIFIED' AND "taxRate" IS NULL AND "taxReason" IS NULL)
 OR ("taxMode" IN ('EXCLUSIVE','INCLUSIVE') AND "taxRate" IS NOT NULL AND "taxRate">=0 AND "taxReason" IS NULL)
 OR ("taxMode"='NOT_APPLICABLE' AND "taxRate" IS NULL AND "taxReason" IS NOT NULL AND length(trim("taxReason"))>0)
);

ALTER TABLE "RentalItemTerm" ADD CONSTRAINT "RentalItemTerm_tax_terms" CHECK (
 ("taxMode"='UNSPECIFIED' AND "taxRate" IS NULL AND "taxReason" IS NULL)
 OR ("taxMode" IN ('EXCLUSIVE','INCLUSIVE') AND "taxRate" IS NOT NULL AND "taxRate">=0 AND "taxReason" IS NULL)
 OR ("taxMode"='NOT_APPLICABLE' AND "taxRate" IS NULL AND "taxReason" IS NOT NULL AND length(trim("taxReason"))>0)
);

ALTER TABLE "WorkOrderCost" ADD CONSTRAINT "WorkOrderCost_tax_terms" CHECK (
 ("taxMode"='UNSPECIFIED' AND "taxRate" IS NULL AND "taxReason" IS NULL)
 OR ("taxMode" IN ('EXCLUSIVE','INCLUSIVE') AND "taxRate" IS NOT NULL AND "taxRate">=0 AND "taxReason" IS NULL)
 OR ("taxMode"='NOT_APPLICABLE' AND "taxRate" IS NULL AND "taxReason" IS NOT NULL AND length(trim("taxReason"))>0)
);

ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_tax_terms" CHECK (
 ("taxMode"='UNSPECIFIED' AND "taxRate" IS NULL AND "taxReason" IS NULL)
 OR ("taxMode" IN ('EXCLUSIVE','INCLUSIVE') AND "taxRate" IS NOT NULL AND "taxRate">=0 AND "taxReason" IS NULL)
 OR ("taxMode"='NOT_APPLICABLE' AND "taxRate" IS NULL AND "taxReason" IS NOT NULL AND length(trim("taxReason"))>0)
);

ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_source" CHECK (
 (kind='RECEIVABLE' AND "customerId" IS NOT NULL AND "machineId" IS NULL AND "acquisitionMethod" IS NULL AND "counterpartyName" IS NULL)
 OR (kind='PAYABLE' AND "machineId" IS NOT NULL AND "customerId" IS NULL AND "rentalId" IS NULL AND "acquisitionMethod" IS NOT NULL AND "counterpartyName" IS NOT NULL AND length(trim("counterpartyName"))>0)
);
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_money" CHECK (
 amount>0 AND currency IN ('TRY','USD','EUR') AND "taxMode"<>'UNSPECIFIED'
 AND "netAmount">=0 AND "taxAmount">=0 AND "grossAmount">0 AND "netAmount"+"taxAmount"="grossAmount"
);
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_document" CHECK ("documentStatus" NOT IN ('RECORDED','OTHER') OR ("documentReference" IS NOT NULL AND length(trim("documentReference"))>0));
ALTER TABLE "FinanceInstallment" ADD CONSTRAINT "FinanceInstallment_amount" CHECK (amount>0);
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_amount" CHECK (amount>0);
ALTER TABLE "FinancePayment" ADD CONSTRAINT "FinancePayment_reversal" CHECK (("reversedAt" IS NULL AND "reversedById" IS NULL AND "reversalReason" IS NULL) OR ("reversedAt" IS NOT NULL AND "reversedById" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(trim("reversalReason"))>0));
INSERT INTO "Permission" (key,scope) VALUES
('finance.payables.view','TENANT'),('finance.payables.manage','TENANT'),('finance.receivables.view','TENANT'),('finance.receivables.manage','TENANT'),('finance.payments.record','TENANT'),('finance.payments.reverse','TENANT') ON CONFLICT DO NOTHING;
WITH grants AS (
 INSERT INTO "RolePermission" ("organizationId","roleId","permissionKey","permissionScope")
 SELECT r."organizationId",r.id,p.key,'TENANT'::"PermissionScope" FROM "Role" r CROSS JOIN "Permission" p
 WHERE r."templateKey"='TENANT_ADMINISTRATION' AND p.key IN ('finance.payables.view','finance.payables.manage','finance.receivables.view','finance.receivables.manage','finance.payments.record','finance.payments.reverse')
 ON CONFLICT DO NOTHING RETURNING *
)
INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata)
SELECT gen_random_uuid(),"organizationId",'SYSTEM','operational-finance-migration','ROLE_PERMISSION_GRANTED','Role',"roleId",'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('permission',"permissionKey") FROM grants;

COMMIT;
