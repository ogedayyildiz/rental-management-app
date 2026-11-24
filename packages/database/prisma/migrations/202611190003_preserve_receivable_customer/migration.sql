BEGIN;
-- A Rental customer correction must never cascade into an approved receivable.
ALTER TABLE "FinanceRecord" DROP CONSTRAINT "FinanceRecord_organizationId_rentalId_customerId_fkey";
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_organizationId_rentalId_customerId_fkey"
FOREIGN KEY ("organizationId", "rentalId", "customerId") REFERENCES "Rental"("organizationId", "id", "customerId")
ON DELETE RESTRICT ON UPDATE RESTRICT;
COMMIT;
