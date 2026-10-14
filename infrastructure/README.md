# Local infrastructure

The root Compose file runs PostgreSQL 17 with the TimescaleDB extension in one
container and Redis in another. This follows ADR-010's shared-cluster option.
Business tables and telemetry hypertables will remain logically separate when
database schemas are introduced. No business schema exists in this bootstrap.

Copy `.env.example` to `.env`, set a local password and matching `DATABASE_URL`,
then start Docker Desktop and run `pnpm infra:up` from the repository root.
Both published ports bind only to `127.0.0.1`. This configuration is for local
development; it is not a production deployment or credential policy.

`pnpm infra:down` stops the containers and preserves named data volumes.
Initialization SQL runs only on an empty PostgreSQL volume. Changing environment
credentials does not change credentials in an already initialized volume.

Application liveness endpoints do not check database or Redis readiness yet.
Terraform and cloud resources are deferred until the deployment phase.
