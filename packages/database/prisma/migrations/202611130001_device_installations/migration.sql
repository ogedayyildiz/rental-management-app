CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "TrackingDevice" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "provider" VARCHAR(100) NOT NULL CHECK (btrim("provider") <> ''),
  "providerDeviceId" VARCHAR(200) NOT NULL CHECK (btrim("providerDeviceId") <> ''),
  "deviceModel" VARCHAR(200),
  "serialNumber" VARCHAR(200),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("organizationId","id"),
  UNIQUE ("organizationId","provider","providerDeviceId")
);

CREATE TABLE "DeviceInstallation" (
  "id" UUID PRIMARY KEY,
  "organizationId" UUID NOT NULL,
  "trackingDeviceId" UUID NOT NULL,
  "machineId" UUID NOT NULL,
  "installedAt" TIMESTAMPTZ(3) NOT NULL,
  "removedAt" TIMESTAMPTZ(3),
  FOREIGN KEY ("organizationId","trackingDeviceId") REFERENCES "TrackingDevice"("organizationId","id") ON DELETE RESTRICT,
  FOREIGN KEY ("organizationId","machineId") REFERENCES "Machine"("organizationId","id") ON DELETE RESTRICT,
  CHECK ("removedAt" IS NULL OR "installedAt" < "removedAt"),
  EXCLUDE USING gist ("trackingDeviceId" WITH =, tstzrange("installedAt","removedAt",'[)') WITH &&)
);
CREATE INDEX "DeviceInstallation_organizationId_machineId_installedAt_idx"
  ON "DeviceInstallation" ("organizationId","machineId","installedAt");

-- Move by closing and appending, never by changing historical attribution.
CREATE FUNCTION guard_device_installation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Installation history cannot be deleted'; END IF;
  IF OLD."removedAt" IS NOT NULL OR NEW."removedAt" IS NULL
     OR (to_jsonb(NEW) - 'removedAt') <> (to_jsonb(OLD) - 'removedAt') THEN
    RAISE EXCEPTION 'Only closing an open installation is allowed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER preserve_installation_history BEFORE DELETE OR UPDATE ON "DeviceInstallation"
FOR EACH ROW EXECUTE FUNCTION guard_device_installation_history();
