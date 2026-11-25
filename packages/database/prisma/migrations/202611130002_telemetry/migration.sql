BEGIN;
CREATE EXTENSION IF NOT EXISTS timescaledb;
ALTER TABLE "TrackingDevice" ADD COLUMN priorities JSONB NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX installation_attribution_key ON "DeviceInstallation" ("organizationId","machineId","trackingDeviceId",id);
CREATE TABLE telemetry_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org uuid NOT NULL, machine uuid NOT NULL, device uuid NOT NULL, installation uuid NOT NULL, source_event text NOT NULL, recorded timestamptz NOT NULL, received timestamptz NOT NULL, digest text NOT NULL,
 FOREIGN KEY(org,machine,device,installation) REFERENCES "DeviceInstallation"("organizationId","machineId","trackingDeviceId",id), UNIQUE(device,source_event), UNIQUE(id,recorded,org,machine,device,installation)
);
CREATE TABLE telemetry_measurement (
 source_event text NOT NULL, event uuid NOT NULL, recorded timestamptz NOT NULL, received timestamptz NOT NULL, org uuid NOT NULL, machine uuid NOT NULL, device uuid NOT NULL, installation uuid NOT NULL, signal text NOT NULL, value jsonb NOT NULL, quality double precision NOT NULL, healthy boolean NOT NULL,
 FOREIGN KEY(event,recorded,org,machine,device,installation) REFERENCES telemetry_event(id,recorded,org,machine,device,installation), PRIMARY KEY(recorded,event,signal)
);
SELECT create_hypertable('telemetry_measurement','recorded');
CREATE INDEX ON telemetry_measurement(org,machine,signal,recorded DESC);
CREATE TABLE telemetry_latest (LIKE telemetry_measurement INCLUDING DEFAULTS, PRIMARY KEY(installation,signal), FOREIGN KEY(event,recorded,org,machine,device,installation) REFERENCES telemetry_event(id,recorded,org,machine,device,installation));
CREATE INDEX ON telemetry_latest(org,machine);
CREATE INDEX telemetry_current_contact ON telemetry_event(installation,recorded DESC);
CREATE TABLE telemetry_contact (installation uuid PRIMARY KEY REFERENCES "DeviceInstallation"(id), recorded timestamptz NOT NULL);
CREATE TABLE telemetry_fault_event (event uuid PRIMARY KEY REFERENCES telemetry_event(id), code text NOT NULL, active boolean NOT NULL, severity text);
CREATE INDEX ON telemetry_event(org,machine,installation,recorded DESC);
CREATE TABLE telemetry_fault_current (installation uuid NOT NULL REFERENCES "DeviceInstallation"(id), code text NOT NULL, active boolean NOT NULL, severity text, first_seen timestamptz NOT NULL,last_seen timestamptz NOT NULL,occurrences integer NOT NULL, PRIMARY KEY(installation,code));

INSERT INTO "Permission" (key,scope) VALUES ('device.read','TENANT'),('device.manage','TENANT'),('device.assign','TENANT'),('device.remove','TENANT'),('telemetry.read','TENANT'),('fault.read','TENANT') ON CONFLICT DO NOTHING;
WITH grants AS (INSERT INTO "RolePermission" ("organizationId","roleId","permissionKey","permissionScope") SELECT r."organizationId",r.id,p.key,'TENANT'::"PermissionScope" FROM "Role" r CROSS JOIN "Permission" p WHERE r."templateKey"='TENANT_ADMINISTRATION' AND p.key IN ('device.read','device.manage','device.assign','device.remove','telemetry.read','fault.read') ON CONFLICT DO NOTHING RETURNING *) INSERT INTO "AuditEvent" (id,"organizationId","actorType","systemActor",action,"targetType","targetId",result,source,"requestId",metadata) SELECT gen_random_uuid(),"organizationId",'SYSTEM','telemetry-migration','ROLE_PERMISSION_GRANTED','Role',"roleId",'SUCCESS','migration',gen_random_uuid(),jsonb_build_object('permission',"permissionKey") FROM grants;
COMMIT;
