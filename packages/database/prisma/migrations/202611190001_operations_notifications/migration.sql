CREATE TABLE "NotificationInteraction" (
 "organizationId" UUID NOT NULL, "membershipId" UUID NOT NULL, "key" CHAR(64) NOT NULL,
 "readAt" TIMESTAMPTZ(3), "acknowledgedAt" TIMESTAMPTZ(3), "dismissedAt" TIMESTAMPTZ(3),
 PRIMARY KEY ("organizationId", "membershipId", "key"),
 FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE CASCADE,
 CHECK ("key" ~ '^[a-f0-9]{64}$')
);
CREATE TABLE "NotificationPreference" (
 "organizationId" UUID NOT NULL, "membershipId" UUID NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT true,
 "domains" TEXT[] NOT NULL DEFAULT ARRAY['RENTAL','MAINTENANCE','TELEMETRY'],
 "lowSocPercent" INTEGER NOT NULL DEFAULT 20 CHECK ("lowSocPercent" BETWEEN 0 AND 100),
 PRIMARY KEY ("organizationId", "membershipId"),
 FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE CASCADE,
 CHECK ("domains" <@ ARRAY['RENTAL','MAINTENANCE','TELEMETRY']::text[])
);
