# Local infrastructure

The root Compose file runs PostgreSQL 17 with the TimescaleDB extension in one
container and Redis in another. This follows ADR-010's shared-cluster option.
Business tables and telemetry hypertables remain logically separate. Versioned
Prisma/SQL migrations create the implemented business and telemetry schemas.

Copy `.env.example` to `.env`, set a local password and matching `DATABASE_URL`,
then start Docker Desktop and run `pnpm infra:up` from the repository root.
Both published ports bind only to `127.0.0.1`. This configuration is for local
development; it is not a production deployment or credential policy.

`pnpm infra:down` stops the containers and preserves named data volumes.
Initialization SQL runs only on an empty PostgreSQL volume. Changing environment
credentials does not change credentials in an already initialized volume.

API `/health` is liveness and `/ready` checks the database (plus restricted role
and environment binding in staging/production). Web readiness depends on API
readiness. Redis is currently reserved; it has a separate infrastructure probe.

## Portable staging / production

`deployment/` contains the production multi-stage Dockerfile, private-network
Compose topology, TLS edge, safe environment templates, explicit migration/seed
tooling, release helper and read-only HTTPS smoke. See
[`docs/26-STAGING-PRODUCTION-READINESS.md`](../docs/26-STAGING-PRODUCTION-READINESS.md)
before using them. These do not select a provider or configure a live host.

`pnpm test:deployment` builds the images and uses uniquely named disposable Docker
resources to check non-root startup, HTTPS/security, database privileges,
dependency failures and a real logical restore. It never reads local Auth0
credentials or resets the normal development database. Logs/artifacts are under
`.e2e/rental-stage-test-*/`. Cloud provisioning/Terraform and real deployment
credentials remain external configuration gates.
