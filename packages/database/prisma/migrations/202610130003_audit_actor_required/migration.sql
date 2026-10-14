-- SQL CHECK accepts NULL, so require a non-null system identifier explicitly.
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actor";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actor"
  CHECK (("actorType" = 'USER' AND "actorUserId" IS NOT NULL AND "systemActor" IS NULL)
      OR ("actorType" = 'SYSTEM' AND "actorUserId" IS NULL
          AND "systemActor" IS NOT NULL AND length("systemActor") > 0));
