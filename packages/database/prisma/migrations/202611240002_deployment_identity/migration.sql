-- Operator-owned infrastructure metadata. Never populated by business or demo seeds.
CREATE TABLE "DeploymentIdentity" (
  id integer PRIMARY KEY CHECK (id = 1),
  environment text NOT NULL CHECK (environment IN ('staging', 'production')),
  "deploymentId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
