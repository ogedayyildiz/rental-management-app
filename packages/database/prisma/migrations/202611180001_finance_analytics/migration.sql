BEGIN;
-- Analytics stores no derived accounting values. Only explicit tenant permission grants.
INSERT INTO "Permission" (key,scope) VALUES
('finance.analytics.view','TENANT'),('finance.analytics.export','TENANT') ON CONFLICT DO NOTHING;
WITH grants AS (
  INSERT INTO "RolePermission" ("organizationId","roleId","permissionKey","permissionScope")
  SELECT r."organizationId",r.id,p.key,'TENANT'::"PermissionScope"
  FROM "Role" r CROSS JOIN "Permission" p
  WHERE r."templateKey"='TENANT_ADMINISTRATION'
    AND p.key IN ('finance.analytics.view','finance.analytics.export')
  ON CONFLICT DO NOTHING RETURNING *
)
INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata)
SELECT gen_random_uuid(),"organizationId",'SYSTEM','finance-analytics-migration','ROLE_PERMISSION_GRANTED','Role',"roleId",'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('permission',"permissionKey") FROM grants;
CREATE INDEX "Rental_finance_period" ON "Rental"("organizationId", "status", "actualStartAt", "actualEndAt");
COMMIT;
