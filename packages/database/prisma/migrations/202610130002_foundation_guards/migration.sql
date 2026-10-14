-- Prisma cannot express these checks and append-only triggers. Keep them in migrations.
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_tenant_only"
  CHECK ("permissionScope" = 'TENANT');
ALTER TABLE "PlatformRolePermission" ADD CONSTRAINT "PlatformRolePermission_platform_only"
  CHECK ("permissionScope" = 'PLATFORM');
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_scope_prefix"
  CHECK ((scope = 'PLATFORM' AND key LIKE 'platform.%') OR
         (scope = 'TENANT' AND key NOT LIKE 'platform.%'));
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "Invitation_expiry"
  CHECK ("expiresAt" > "createdAt");
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "Invitation_acceptance"
  CHECK ((status = 'ACCEPTED' AND "acceptedAt" IS NOT NULL AND "acceptedById" IS NOT NULL)
      OR (status <> 'ACCEPTED' AND "acceptedAt" IS NULL AND "acceptedById" IS NULL));
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "Invitation_token_hash"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actor"
  CHECK (("actorType" = 'USER' AND "actorUserId" IS NOT NULL AND "systemActor" IS NULL)
      OR ("actorType" = 'SYSTEM' AND "actorUserId" IS NULL AND length("systemActor") > 0));

CREATE FUNCTION protect_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only';
END;
$$;
CREATE TRIGGER audit_event_no_change BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION protect_audit_event();
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_audit_event();
