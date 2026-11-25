BEGIN;
INSERT INTO "Permission" (key,scope) VALUES ('audit.read','TENANT') ON CONFLICT DO NOTHING;
WITH grants AS (
  INSERT INTO "RolePermission" ("organizationId","roleId","permissionKey","permissionScope")
  SELECT "organizationId",id,'audit.read','TENANT'::"PermissionScope" FROM "Role"
  WHERE "templateKey"='TENANT_ADMINISTRATION'
  ON CONFLICT DO NOTHING RETURNING *
)
INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata)
SELECT gen_random_uuid(),"organizationId",'SYSTEM','tenant-administration-migration','ROLE_PERMISSION_GRANTED','Role',"roleId",'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('permission',"permissionKey") FROM grants;
CREATE INDEX "Membership_org_status_id" ON "Membership"("organizationId",status,id);
CREATE INDEX "OrganizationInvitation_org_id" ON "OrganizationInvitation"("organizationId",id);
CREATE INDEX "AuditEvent_org_time_id" ON "AuditEvent"("organizationId",timestamp,id);
COMMIT;
