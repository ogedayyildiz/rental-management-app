# Staging / Production Readiness — Phase 1

Status: the deployment foundation is implemented and automatically verified. This is not evidence of a live staging or production installation. The preceding business baseline was commit `774e1f3` (190 unit/integration tests, 55 browser scenarios); the verified readiness baseline is recorded below.

## 1. Scope and topology

No cloud provider is selected. The older preferred-provider discussion in the system architecture is not an authorization to provision that provider. The initial portable target is a maintained Linux host with Docker Engine and the Compose plugin, persistent storage and an operator-managed firewall. Docker Desktop is used only for local verification.

```text
Browser -- HTTPS --> TLS edge (NGINX, non-root)
                       |
                    Next.js Web -- bearer token --> NestJS API
                       |                              |
                    Auth0                      PostgreSQL + TimescaleDB

Private network: PostgreSQL, Redis, API, optional idle telemetry/worker services
Only the TLS edge publishes a host port. Web/API have outbound access for Auth0.
```

`infrastructure/deployment/compose.yaml` implements this single-host starting point. PostgreSQL 17/TimescaleDB share a cluster (ADR-010). No Kubernetes, extra broker, new domain service or public database is added. Web and API are separate processes; business services remain in the modular monolith. This is not an HA topology: host/database failure needs restore or failover operations. Managed database replacement is possible after choosing a provider and verifying TLS/extensions/backups.

The telemetry and worker images are available under the `idle-services` profile. Their HTTP processes have liveness and explicit idle readiness, but **no production provider listener, worker consumer or BullMQ job processor exists**. They are not started by the normal release. The simulator remains a controlled application-boundary tool, not a public ingress. No object storage is required by current in-memory PDF/XLSX exports; future uploads need a private S3-compatible adapter, credentials and policy before enabling them.

## 2. Environment isolation

| Environment | Identity and data | Entry point |
| --- | --- | --- |
| development | Existing local Auth0 configuration and local `rental` database | root Compose, `pnpm ... dev`, loopback HTTP allowed |
| E2E/test | Unique disposable databases, synthetic identities injected only into a copied Web/testing module | `pnpm test:e2e`; never the development DB |
| staging | Separate Auth0 tenant/API/application, database, runtime role, session secret, deployment UUID and volumes | production images, `NODE_ENV=production`, `DEPLOYMENT_ENV=staging` |
| production | Separate production equivalents and operational approval | same immutable images, `DEPLOYMENT_ENV=production` |

`DEPLOYMENT_ENV` describes the deployment; `NODE_ENV` controls framework optimization. Runtime image entrypoints accept only staging/production, require production Node mode, and reject `RENTAL_E2E*` switches. There is no test-auth route or runtime verifier selection. The ordinary API probe in browser tests uses the compiled Auth0 adapter with development deployment configuration; a separate real-image test proves hardened production startup rejects identity injection.

`DeploymentIdentity` is a singleton infrastructure table, created by an additive migration. An operator binds an empty staging/production database to its environment and random `DEPLOYMENT_ID`. API startup/readiness compare this binding with runtime configuration and reject privileged database accounts. Runtime credentials cannot change the binding. `DATABASE_NAME` must match the URL. External database connections require `sslmode=verify-full`; plaintext is accepted only for the private Compose host `postgres`. Do not override certificate verification. This protects common accidental environment swaps; an operator who deliberately copies *all* environment credentials/identifiers can defeat any such configuration guard and must be controlled operationally.

Existing development databases receive an empty metadata table through the normal migration; they are not silently converted into staging. The deployment initializer refuses an existing unbound business database. Each environment needs distinct Compose project names, secrets, DNS, volumes and access controls. Never share staging and production Auth0 applications or session secrets.

## 3. Configuration and secrets

Safe templates are in `infrastructure/deployment/*env.example`; none contain working credentials. Create operator-owned `local/web.env`, `local/api.env`, `local/migrator.env`, `local/postgres.env` and optional `local/idle.env`. `local/` is Git-ignored and Docker-excluded. Keep files readable only by the deployment operator, except TLS certificates/keys which must be readable by the non-root edge UID 101 using narrowly scoped group/file permissions. Do not make real private keys world-readable. Test fixtures use disposable certificates only.

| Category | Variables | Treatment |
| --- | --- | --- |
| PUBLIC | `APP_BASE_URL`, Auth0 issuer/domain/client ID/audience, `PUBLIC_HOST` | Public identifiers, still environment-specific; no invented real values |
| SERVER CONFIG | `DEPLOYMENT_ENV`, `DEPLOYMENT_ID`, `HOST`, service ports, `API_BASE_URL` | Inject at runtime; UUID is an environment binding, not an authorization credential |
| SECRET / AUTH0 | `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` | Web only; random 32-byte hex session key; no build arguments/client bundle |
| AUTH0 | `AUTH0_ISSUER`, `AUTH0_ALLOWED_CLIENT_IDS`, `AUTH0_AUDIENCE` | API verifies issuer, audience and allowed clients; no provider roles authorize business actions |
| DATABASE | `DATABASE_URL`, `DATABASE_NAME` | API gets restricted runtime URL; migrator gets owner URL separately |
| DATABASE SECRET | `POSTGRES_PASSWORD`, `RUNTIME_DATABASE_PASSWORD` | PostgreSQL/migrator only; generate separate strong values, URL-encode passwords in URLs |
| TELEMETRY | `TELEMETRY_FRESH_SECONDS` | Freshness configuration, not rental/service eligibility |
| STORAGE | TLS file mounts, database/Redis volumes | No application object-storage credentials currently required |
| OBSERVABILITY | platform log collector configuration | JSON stdout/stderr; no Sentry DSN or OTel exporter is currently active |
| COMPOSE | `DEPLOYMENT_NAME`, `IMAGE_PREFIX`, `IMAGE_TAG`, `PUBLIC_HOST`, `HTTPS_PORT` | `.env` contains interpolation settings only; use verified full commit SHA as image tag |

Generate new secrets with an OS secret manager or `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` in a private terminal. Do not paste the result into chat, logs, issues or docs. Generate `DEPLOYMENT_ID` with `crypto.randomUUID()`. Root development `.env` is never a staging template. Real secret storage/injection remains the chosen platform's responsibility; no secret-management provider is selected here. Rotate a compromised session secret to invalidate sessions; coordinate client/database credential rotation without changing identity keys.

Next.js does not use `next.config.env` to embed credentials. No `NEXT_PUBLIC_*` secret exists. Images build without `.env`, source-control metadata, certificates, E2E reports or test databases. Only compiled package files and required runtime dependencies are deployed; the one-shot migrator additionally contains Prisma tooling/schema/migrations. The Next standalone artifact traces the server dependencies it needs. Do not publish image/build artifacts containing externally supplied credentials.

## 4. Auth0 and session gates

Create separate staging and production Auth0 tenants where possible, with a custom API and Regular Web Application in each. Copy real values into the corresponding templates; do not change the verified development tenant automatically.

For each selected real HTTPS origin `ORIGIN`:

1. API identifier becomes `AUTH0_AUDIENCE`; use RS256 and the verified issuer with trailing `/` in `AUTH0_ISSUER`.
2. Web application domain/client ID/client secret populate `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`. API `AUTH0_ALLOWED_CLIENT_IDS` includes this environment's Web ID only until more clients are deliberately enabled.
3. Allowed Callback URLs: `ORIGIN/auth/callback`. Allowed Logout URLs: `ORIGIN`. Allowed Web Origins/Application Login URI use the exact configured origin and `ORIGIN/auth/login` where the dashboard requires them. No wildcard or loopback callback in staging/production.
4. Keep authorization-code flow, refresh-token rotation/reuse detection and offline access consistent with the accepted Auth0 guide. Do not enable password grant. Apply appropriate organization MFA policy and verify recovery manually. Email must be verified for invitation acceptance.
5. `APP_BASE_URL=ORIGIN`; `API_BASE_URL=http://api:3001` only on the private Compose network. API has no public browser endpoint and no wildcard credentialed CORS.
6. Native application rollout is deferred. Do not add speculative mobile callback URLs or secrets.

These are the persistent hosted-application callbacks. The existing one-time
operator CLI requires a temporary workstation-loopback callback, removed immediately
after bootstrap; the controlled staging procedure and private database access are
documented in [the staging plan](27-STAGING-DEPLOYMENT-PLAN.md#8-first-platform-operator).

The Auth0 SDK uses HttpOnly encrypted cookies; the application explicitly sets Secure for HTTPS, SameSite=Lax, Path=/ and no Domain. Broader cookie-domain/path overrides are rejected. Session duration remains eight hours absolute and one hour inactivity. Callback destinations remain fixed (`/dashboard` or the safe error page), not caller-controlled external redirects. HTTPS and the configured origin drive callbacks, not untrusted forwarded host headers.

Automated production-image checks use synthetic OIDC discovery to check redirect, PKCE, audience and cookie structure; they do **not** claim real Auth0 login/MFA verification. After configuring real staging, manually verify login/logout/re-login, invitations, MFA/recovery and operator/tenant separation with dedicated staging accounts. Never automate personal credentials.

## 5. Web/edge protections

The edge terminates TLS 1.2/1.3, fixes forwarded host/protocol, replaces forwarded client addresses, rejects unexpected Host values, limits request bodies to 16 KiB and uses finite connection/body/proxy timeouts. Only port 443 (or an explicitly chosen port) is published. If a trusted load balancer is placed ahead of it later, explicitly configure its exact trusted addresses; never trust arbitrary `X-Forwarded-For`. Otherwise limits group clients behind the same NAT address; monitor and tune deliberately.

Production responses have nonce-based CSP (no script unsafe-inline/eval), frame-ancestors none/X-Frame-Options DENY, nosniff, strict-origin-when-cross-origin and disabled camera/microphone/geolocation browser permissions. HSTS has one-year max age on HTTPS production-mode responses; includeSubDomains/preload are deliberately not imposed on unselected domains. Inline styles and blob workers remain allowed for React/MapLibre; maps currently use same-origin bundled assets. External tile providers would need an explicit CSP and data-sharing review. Per-request nonces require dynamic rendering; cached static HTML must not reuse a nonce.

The authenticated Next bridge retains its route allowlist, server-side tokens, mutation Origin check and no-redirect upstream fetch. Input is read with a byte limit before accumulation. PDF/XLSX responses stream through the bridge. API browser Origin headers must match the configured origin; the API intentionally does not enable CORS. Tokens still pass through the existing Auth0 `IdentityVerifier`; tenant/branch and financial permissions still come from current database state.

Initial edge limits (per observed client IP): general dynamic requests 300/minute with burst 50, Auth0 routes 30/minute with burst 10, invitation acceptance 10/minute with burst 5, exports 20/minute with burst 3. Static/map assets are excluded. Excess requests return 429. API additionally caps concurrent exports at four per process. These are operational abuse/resource limits, not changes to business permissions. No public telemetry ingress exists; any future ingress must add device credential verification, payload limits and independent per-device/provider quotas before exposure.

## 6. Health, lifecycle and logs

| Process | Liveness | Readiness |
| --- | --- | --- |
| API | `/health`: process running | `/ready`: PostgreSQL reachable; hardened mode also checks deployment binding and runtime privileges/audit guards |
| Web | `/health`: process running | `/ready`: private API ready |
| worker | `/health` | `/ready`: explicitly `idle`, consumers disabled |
| telemetry | `/health` | `/ready`: explicitly `idle`, ingress disabled |
| PostgreSQL / Redis | private container probes | PostgreSQL `pg_isready`; Redis PING |

Dependency failures produce generic 503 readiness responses without hostnames, credentials or query errors. Redis is not a current Web/API dependency, so losing unused Redis must not misrepresent an unavailable business API; deployment smoke separately verifies Redis.

Nest shutdown hooks close database connections. Node services stop accepting HTTP work and close idle connections. Container init forwards signals; the entrypoint forwards TERM/INT and allows 25 seconds before forced exit, within Compose's 30-second stop grace. API request/header timeouts are 30/15 seconds; the bridge upstream timeout is ten seconds. Interactive operations must finish within these budgets or roll back. There are no queue acknowledgements or in-flight provider packets to claim safe today; future consumers require drain/retry/idempotency verification before enablement. Never kill an executing migration as the normal release procedure.

API structured logs contain service, generated request ID, method, normalized route template, status and duration. The same request ID flows into normal authenticated audit actions and the bridge response. API error messages are deliberately coarse; exception messages, request bodies, URLs/query strings, cookies, headers, personal names and money values are omitted. Edge JSON logs omit URLs (including Auth0 callback codes), headers and bodies; edge critical error logging is suppressed to avoid raw request contexts. Web instrumentation emits a coarse server-failure event. Worker/telemetry startup failures remain structured. Restrict log access and use log rotation; do not enable ORM parameter/debug-auth logging in deployment.

Health, 5xx/error rate, request duration, container restarts/OOM, database storage/connections, backup freshness and Redis status are the initial monitoring signals. A host/platform collector and alert destination must be configured before operational handover. Sentry and later OpenTelemetry remain the documented direction, but no credentialed exporter/account is claimed here. `onRequestError` and backend structured error handling are safe collection boundaries; any future exporter must retain redaction and avoid duplicate systems. Hosted centralized monitoring and alert delivery still require external setup.

## 7. Explicit migrations, seed and database roles

Production never runs `prisma migrate dev`, `db push`, reset or automatic migrations during application startup. Release runs a one-shot **migrator** image using `prisma migrate deploy`; failure stops rollout. `operations/database.mjs status` checks migration state. Always rehearse the exact additive migration/image combination against staging and take a restorable backup before production.

For a new empty deployment, set `INITIALIZE_DATABASE=1` for the first migrator run only, then return it to `0`. The migrator verifies database name/environment binding, applies migrations, binds the database, provisions a separate runtime login, and invokes the existing idempotent system permission seed. The seed creates no users, memberships, customers, machines, rentals or E2E personas. Tenant role templates remain permission collections used by onboarding. First PlatformAccess remains the existing explicitly invoked, verified-identity bootstrap, not an HTTP bypass.

The runtime login has no superuser/create-role/create-database/replication/bypass-RLS privilege, no role inheritance or table/database ownership, no schema CREATE and no TRUNCATE grants. It can execute existing business transactions but cannot UPDATE/DELETE AuditEvent, disable its owner-controlled triggers, change DeploymentIdentity, or edit Prisma migration history. Re-run the grant step after each migration rather than giving unconstrained default grants to future tables. An owner can always override database protections; restrict migration/backup/operator credentials separately from application processes and audit that operational access.

Migration failure may require a reviewed Prisma `migrate resolve` recovery after inspecting the failure and restoring/repairing in staging; never blindly mark failed migrations applied. Roll back application images only when the old version is compatible with the already-applied additive schema. Do not roll back by deleting history or dropping columns.

## 8. Backups and restore

Recommended initial policy, to be accepted with the chosen host/provider: encrypted daily full logical backups, seven daily/four weekly/twelve monthly recovery points, stored off-host under separate credentials. A daily-only policy has up to 24 hours of data-loss exposure. For real operations require managed/operated WAL archiving/PITR with an agreed recovery objective (proposed RPO ≤15 minutes and RTO ≤4 hours), monitoring and tested recovery. These are targets, not achieved guarantees. Protect encryption keys separately; test access to both backup and keys. Do not put backups in public buckets or repository artifacts.

Use compatible PostgreSQL/TimescaleDB versions and full custom-format `pg_dump -Fc`, including AuditEvent and deployment metadata. For restore, create a **new isolated target**, enable TimescaleDB, call `timescaledb_pre_restore()`, restore using `pg_restore --exit-on-error` without parallel `-j`, then call `timescaledb_post_restore()`. Validate business counts, FK/tenant integrity, hypertables, audit records/triggers and application readiness before switching traffic. Do not restore over the development or live database as an experiment. Roles/grants/secret recovery need a separate controlled runbook; a logical database dump does not back up role passwords or infrastructure secrets.

`pnpm test:deployment` performs an actual disposable logical dump/restore, including a synthetic time-series hypertable, the platform telemetry hypertable, permission seed and an immutable audit event. It checks restored data and trigger enforcement, then destroys only its own random test containers/volumes. This proves the local logical procedure only, not encrypted off-site backups, cloud PITR, production scale or a recovery-time guarantee. Restoring production data into staging requires approved sanitization and explicit operator rebinding of infrastructure metadata after isolation; runtime applications cannot rebind it.

Reference: [Timescale logical backup/restore](https://www.tigerdata.com/docs/deploy/self-hosted/backup-and-restore/logical-backup).

## 9. Redis and telemetry retention

Redis currently has no production session, cache or job consumer. Auth0 sessions use encrypted cookies; authoritative users, memberships, rentals, financial records and audit are in PostgreSQL. Compose retains Redis AOF with noeviction, but loss/recreation currently loses no authoritative business state. Before BullMQ is enabled, document job replay/idempotency, failure/retention, durability and shutdown. Do not treat AOF alone as a business backup.

Telemetry event evidence, normalized measurements, latest-per-signal/contact read models, fault history/current faults and DeviceInstallation history remain in PostgreSQL/TimescaleDB. No automatic retention/deletion policy is enabled in this phase. Preserve raw evidence/provenance as currently implemented; unknown provider payload storage is not invented. Fault/installation history must not disappear with a device change. Size and storage alerts are required because indefinite retention grows without bound. Agree raw/normalized/fault retention and archival/legal requirements before adding irreversible Timescale retention jobs. Current read models can be rebuilt conceptually from retained sources; no untested rebuild procedure is promised. Real Ruptela, Xtellio, hardware and public ingress remain unverified.

## 10. Exports and resource limits

Exports use in-memory PDFKit/ExcelJS and safe fixed/UUID filenames, no caller-supplied filesystem paths and no local persistent files. The web bridge streams the existing binary response rather than making another full copy. Financial omission remains enforced by backend services and covered by regression tests. Temporary container storage is bounded and ephemeral; export correctness does not depend on writable disk.

Lists use existing bounded cursor pagination (maximum 100). Finance retains its existing bounded range/record policy; telemetry history retains its time-range/point/signal limits. Maintenance synchronous exports now reject histories over 1,000 work orders instead of collecting an unlimited number or silently truncating. Four concurrent API exports and edge limits contain memory pressure, but large complex histories still require representative memory/load testing; a future asynchronous report design is outside this phase. Container memory limits are initial operating budgets, not supported-user claims.

The browser suite adds a small repeat-read timing sample for domain lists with artifacts. It is a regression diagnostic on deterministic fixtures, not a capacity benchmark. Inspect plans/slow queries on representative anonymized staging data before sizing a host. Dashboard/Finance/source resolvers keep their current scope predicates and batching; this phase adds no distributed cache or stale permission cache.

## 11. Build and release operations

The local container drill needs Docker Engine, OpenSSL (Git for Windows supplies it), Chromium, and at least 15 GB of spare build space. A Linux CI runner can perform the same check when local resources are insufficient. Build from the exact verified commit using `infrastructure/deployment/Dockerfile` targets `web`, `api`, `worker`, `telemetry`, `migrator`:

```sh
docker build -f infrastructure/deployment/Dockerfile --target web -t rental/web:COMMIT .
# Repeat for api, worker, telemetry and migrator with the same COMMIT.
pnpm test:deployment
```

Node/pnpm versions are pinned; the Node and TLS-edge images include verified digests. Track security updates deliberately and rebuild/retest. Dependencies use the frozen workspace lockfile and runtime packages are produced with `pnpm deploy`. The Web target is Next standalone. Applications run as non-root with read-only filesystems, dropped capabilities, no-new-privileges and limited tmpfs. Database/Redis initialization images retain their standard privilege-dropping entrypoints; they are never privileged containers or publicly published services. Container/image vulnerability scanning and patch ownership remain operational release gates, not evidence of a vulnerability-free image.

On the chosen Linux host prepare `/opt/rental-staging`, copy Compose/template/release script and an image archive, and configure its `.env`, `local/*.env` and TLS files. Example sequence (real configuration must exist first):

```sh
docker compose --env-file .env -f compose.yaml up -d --wait postgres redis
docker compose --env-file .env -f compose.yaml run --rm migrate
docker compose --env-file .env -f compose.yaml up -d --wait api web proxy
docker compose --env-file .env -f compose.yaml run --rm migrate operations/database.mjs status
```

The migration command is not a continuously running service. Never use `down -v` for upgrades. Host firewall, disk encryption, OS patching, TLS certificate issuance/renewal and backup scheduling must be configured outside the application. The edge deliberately does not automate certificate issuance or select a DNS/provider account.

## 12. CI/CD and post-deployment smoke

`Workspace verification` retains unit/integration tests, all browser scenarios, lint, strict TypeScript, formatting and full build. A separate deployment job builds the production targets and runs the disposable HTTPS/runtime-role/restore checks. Diagnostic artifacts contain synthetic data only; certificates/private keys are removed before upload.

`Prepare or deploy staging` is manual. It requires an exact full SHA with successful Workspace verification, builds/tests/saves those images, then optionally deploys through the GitHub `staging` Environment. Configure required reviewers and branch restrictions before allowing deploy. Artifact preparation defaults to **no deployment**. No target/credentials are invented.

For the optional SSH adapter configure GitHub environment variables `STAGING_HOST`, `STAGING_SSH_USER`, `STAGING_ORIGIN`, `STAGING_AUTH0_ISSUER`, `STAGING_AUTH0_AUDIENCE`; secrets `STAGING_SSH_KEY` and pinned `STAGING_KNOWN_HOSTS`. Use a dedicated tightly controlled deployment account, not a personal login; Docker access is host-privileged operational access. The host must already contain environment-specific runtime secrets/TLS and Docker Engine/Compose. SSH strict host-key checking is mandatory. Images transfer to fixed `/opt/rental-staging`; release loads images, waits for dependencies, runs explicit migration/seed, starts services, checks Redis, then performs external HTTPS smoke. A failed stage stops the workflow. The prior version remains the rollback reference; no automatic destructive database rollback exists.

`pnpm smoke:staging` reads `STAGING_ORIGIN`, `AUTH0_ISSUER`, `AUTH0_AUDIENCE` and performs read-only HTTPS checks: Web/API readiness, static JS, protected `/me`, absence of impersonation endpoints, CSP/HSTS and real issuer redirect/PKCE/cookie structure. It never signs in a user. Certificate verification stays enabled; only the separate disposable local-image test accepts its own self-signed TLS certificate. Actual staging deployment, DNS/TLS, Auth0 login/MFA and off-host monitoring cannot be claimed until configured and exercised.

## 13. Focused security review and boundaries

Concrete changes: bounded bridge body streaming, streamed export forwarding, capped synchronous export history/concurrency, explicit HTTPS/cookie/CSP policies, private API/origin enforcement, rate-limited edge, environment-bound non-owner DB runtime and readiness checks, safe request correlation, explicit migration-only tooling and secret-free image contexts.

Existing protections remain: identifier+organization scoping, selected-branch predicates, permission collection authorization, per-request database membership checks, platform/tenant separation, backend financial redaction, hashed single-use/revalidated invitation acceptance and transactional audit. Provider payloads cannot choose arbitrary tenants/machines; production ingress stays closed. Existing negative tests are retained. No claim is made that a focused review replaces independent penetration testing, dependency scanning or operational access review.

No invitation delivery provider is selected. Existing invitation token delivery remains manual; a future provider adapter must consume the onboarding result through an application interface, use idempotent delivery and avoid logging tokens. In-app notification delivery boundaries remain unchanged; no SMS/WhatsApp/push integration is added.

## 14. Verification record and remaining gates

On **2026-11-24**, local verification passed **199 unit/integration/security tests** and **57 Chromium Playwright scenarios**, plus lint, strict TypeScript, formatting and full workspace build. The normal development database received only additive migration `202611240002_deployment_identity` (16 migrations total); existing development records were preserved and PostgreSQL/Redis remained healthy.

Hosted [run 45420210099](https://github.com/ogedayyildiz/rental-management-app/actions/runs/45420210099) at `b12a2721b70f13dd22cbd2ee7a398a7b3d77ae24` passed the full regression/quality job and production deployment job. All five images built and started under their intended restrictions. The drill verified explicit/idempotent migrations and seed, no seeded business identities, runtime audit restrictions, production artifact isolation, HTTPS/CSP/cookies/PKCE redirects against synthetic discovery, rate limiting, environment/test-auth rejection, dependency failure, and an actual TimescaleDB logical restore with data/audit protection intact. Follow-up branch commits rerun these gates; the drill also asserts orderly process shutdown without forced termination.

An initial Linux probe failure was caused by attaching the test TLS edge only to an internal Docker network. The harness now mirrors Compose's private plus publishable edge networks; no database port was exposed. Local container building was constrained by approximately 2 GB free disk space; the complete production-container and restore drill ran successfully on hosted Linux CI. This does not claim local Windows container-drill success, live staging Auth0, off-site encrypted backup safety, hosted monitoring, or production-scale recovery.

Required external gates: choose host/provider and regions; actual DNS/TLS and renewal; separate staging/production Auth0 configuration and dedicated-account login/MFA checks; runtime/operator secrets and restricted host access; off-host encrypted backups and production-size recovery/PITR drill; log collection/alerts and patch/vulnerability management; representative capacity checks; optional SSH/GitHub environment approval setup. Object storage, real-provider telemetry ingress, queues, mobile, remote commands, geofencing and email delivery remain disabled/deferred.

Related: `AGENTS.md`, architecture/security/coding standards, ADR-008/010/011, docs/13/14/18/19/20/21/23/24/25. Framework references: [Next CSP/nonces](https://nextjs.org/docs/app/guides/content-security-policy), [pnpm portable deployment](https://pnpm.io/cli/deploy), [Auth0 SDK cookie security](https://github.com/auth0/nextjs-auth0/blob/main/SECURITY.md).
