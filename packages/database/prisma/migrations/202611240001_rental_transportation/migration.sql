BEGIN;

CREATE TABLE "RentalCharge" (
  id UUID NOT NULL PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "rentalId" UUID NOT NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'TRANSPORT',
  currency CHAR(3) NOT NULL,
  "customerPrice" DECIMAL(30,2) NOT NULL,
  "taxMode" "TaxMode" NOT NULL,
  "taxRate" DECIMAL(9,6),
  "taxReason" VARCHAR(1000),
  "supplierName" VARCHAR(200),
  "supplierCost" DECIMAL(30,2),
  "supplierTaxMode" "TaxMode",
  "supplierTaxRate" DECIMAL(9,6),
  "supplierTaxReason" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMPTZ(3),
  "createdById" UUID NOT NULL,
  CONSTRAINT "RentalCharge_rental_fkey" FOREIGN KEY ("organizationId","rentalId") REFERENCES "Rental"("organizationId",id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalCharge_creator_fkey" FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RentalCharge_kind" CHECK (kind='TRANSPORT'),
  CONSTRAINT "RentalCharge_money" CHECK (currency IN ('TRY','USD','EUR') AND "customerPrice">=0),
  CONSTRAINT "RentalCharge_customer_tax" CHECK (
    ("taxMode" IN ('EXCLUSIVE','INCLUSIVE') AND "taxRate" IS NOT NULL AND "taxRate">=0 AND "taxReason" IS NULL)
    OR ("taxMode"='NOT_APPLICABLE' AND "taxRate" IS NULL AND "taxReason" IS NOT NULL AND length(trim("taxReason"))>0)
  ),
  CONSTRAINT "RentalCharge_supplier" CHECK (
    ("supplierCost" IS NULL AND "supplierName" IS NULL AND "supplierTaxMode" IS NULL AND "supplierTaxRate" IS NULL AND "supplierTaxReason" IS NULL)
    OR ("supplierCost" IS NOT NULL AND "supplierCost">=0 AND "supplierTaxMode" IS NOT NULL AND (
      ("supplierTaxMode" IN ('EXCLUSIVE','INCLUSIVE') AND "supplierTaxRate" IS NOT NULL AND "supplierTaxRate">=0 AND "supplierTaxReason" IS NULL)
      OR ("supplierTaxMode"='NOT_APPLICABLE' AND "supplierTaxRate" IS NULL AND "supplierTaxReason" IS NOT NULL AND length(trim("supplierTaxReason"))>0)
    ))
  ),
  CONSTRAINT "RentalCharge_history_dates" CHECK ("removedAt" IS NULL OR "removedAt">="createdAt")
);
CREATE UNIQUE INDEX "RentalCharge_organizationId_id_key" ON "RentalCharge"("organizationId",id);
CREATE INDEX "RentalCharge_organizationId_rentalId_removedAt_idx" ON "RentalCharge"("organizationId","rentalId","removedAt");
CREATE UNIQUE INDEX "RentalCharge_one_current_transport" ON "RentalCharge"("organizationId","rentalId",kind) WHERE "removedAt" IS NULL;

INSERT INTO "Permission" (key,scope) VALUES
('rentals.transport_costs.view','TENANT'),('rentals.transport_costs.edit','TENANT') ON CONFLICT DO NOTHING;
WITH grants AS (
 INSERT INTO "RolePermission" ("organizationId","roleId","permissionKey","permissionScope")
 SELECT r."organizationId",r.id,p.key,'TENANT'::"PermissionScope" FROM "Role" r CROSS JOIN "Permission" p
 WHERE r."templateKey"='TENANT_ADMINISTRATION' AND p.key IN ('rentals.transport_costs.view','rentals.transport_costs.edit')
 ON CONFLICT DO NOTHING RETURNING *
)
INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata)
SELECT gen_random_uuid(),"organizationId",'SYSTEM','rental-transportation-migration','ROLE_PERMISSION_GRANTED','Role',"roleId",'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('permission',"permissionKey") FROM grants;

COMMIT;
