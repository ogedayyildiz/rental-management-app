# First staging deployment plan

Date: **2026-11-25**. Status: preparation only; **no provider, region, domain or live
deployment has been selected or provisioned**. This plan uses the existing production
artifacts and changes no business behavior. Resource figures are initial engineering
budgets for a few pilot users, a small fleet and low-volume synthetic telemetry, not
measured capacity guarantees or cloud prices.

## 1. Verified baseline and repository integration

The implementation baseline is `4547f694f5a273bdba778996d083657fbac36647` on
`codex/verify-telemetry-ci`: **199 unit/integration tests, 57 Playwright scenarios**,
lint, strict TypeScript, formatting and full build passed. Hosted
[Workspace verification 45422642536](https://github.com/ogedayyildiz/rental-management-app/actions/runs/45422642536)
also built/tested all five production images, exercised restricted runtime accounts,
HTTPS/security headers, shutdown and an actual disposable PostgreSQL/TimescaleDB
logical backup restoration. This is not proof of live staging, off-site recovery or
real-provider telemetry.

Inspection found a clean working tree, with `main`/`origin/main` at `dd85bbca0b070a33220fea8ee3ded2b9e17762fa`,
an ancestor of the feature branch: 0 main-only and 17 feature-only commits before
this planning change. All expected platform phases are present; the feature tip was
already on origin. [PR #1](https://github.com/ogedayyildiz/rental-management-app/pull/1)
prepares normal integration into `main`. Do not merge before its current checks pass.
This task does not merge, rewrite history or change GitHub protections.

A redacted Gitleaks 8.30.1 scan of all 19 reachable commits found one intentionally
unsigned synthetic JWT in an authentication rejection test; no live credential finding
remained. No committed historical path matched the repository's current ignore rules.
This is a bounded audit, not a guarantee that every possible secret format is detectable.

At inspection, `main` had **no branch protection or effective repository rules**.
Before ongoing releases, the owner should require PR review and successful `chromium`
and `deployment` checks and restrict force pushes/deletion. The workflow now also
runs on `main` pushes, keeping the merged commit verifiable for release preparation.
Check the PR and exact commit's Actions results rather than assuming branch protection
enforces them. Do not deploy an unverified merge SHA.

## 2. Required resources and initial sizing

### Actual runtime inventory

| Component | Current requirement | Initial resource budget / storage |
| --- | --- | --- |
| Next.js Web | One standalone Node process; internal TCP 3000 | Existing Compose limit 768 MiB; ephemeral `/tmp` 64 MiB |
| NestJS API | One modular-monolith process; internal TCP 3001 | Existing Compose limit 1,024 MiB; ephemeral `/tmp` 64 MiB |
| TLS edge | Existing non-root NGINX; public 443 to container 8443 | Approximately 64–128 MiB; certificate/key mounts |
| PostgreSQL + TimescaleDB | **One cluster and one application database**, not two independent databases | Budget 1–2 shared vCPUs and about 1.5 GiB RAM initially; 20–30 GiB data allocation plus WAL/temp/free space |
| Redis | Present in release Compose; currently no app/session/job consumer | Budget 128–256 MiB RAM and about 1 GiB AOF space initially; private only |
| Migrator | One-shot image; explicit deploy/seed before API starts | Allow roughly 512 MiB–1 GiB temporarily; share host CPU; no persistent process |
| Worker | Image exists; HTTP health service only, no BullMQ consumer | Leave `idle-services` profile off; if testing process health, allow roughly 128 MiB |
| Telemetry | Image exists; HTTP health service only, no public provider listener | Leave `idle-services` profile off; no always-on ingestion CPU allocation justified yet |
| Export/object storage | PDF/XLSX generated in memory; bridge streams results | No S3 bucket or persistent application upload volume required today |
| Backup destination | Separate encrypted off-host storage | Size from actual compressed dumps and retention; separate credentials and encryption-key recovery |

For the smallest single-host pilot, start planning around **2 vCPU, 4 GiB RAM and
80 GiB encrypted SSD** on maintained **Linux amd64**, with builds performed in CI.
This is a constrained starting point, not a promise of comfortable simultaneous
large exports or ingest load. Keep swap from masking sustained memory pressure;
monitor OOM, RSS, DB connections and disk. A **4 vCPU / 8 GiB** host is a headroom
option if representative smoke/load measurements justify it, not a prerequisite.

The 80 GiB host budget includes OS, current/rollback images and transient release
archives (about 15–20 GiB), initial DB data (20–30 GiB), Redis/WAL/temp/backup scratch
and at least 20% free headroom. Off-host backup storage is additional. Do not retain
all image archives or unbounded local dumps. The existing Compose file caps Web/API
memory but does **not** cap PostgreSQL/Redis memory or configure database tuning for
these budgets; set/tune appropriate limits on the chosen host before pilot load.
Monitor telemetry growth because no automatic retention/deletion policy exists.

### Database compatibility gate

The tested image is `timescale/timescaledb:2.30.0-pg17`. Migrations require
**`timescaledb` and `btree_gist`**, including hypertables, exclusion constraints,
transactions, custom triggers and organization-scoped foreign keys. Prisma and
telemetry SQL share `DATABASE_URL`; splitting ordinary PostgreSQL and time-series
data between unrelated databases is not a deployment configuration supported today.

A managed service must support this extension/version combination or a separately
verified compatible version, owner/migrator operations, runtime-role provisioning,
audit protections, full backups/restore and verified TLS. The current migrator uses
`CREATE/ALTER ROLE`, database/schema grants/revocations and Timescale operations;
ordinary managed PostgreSQL branding does not prove these privileges/extensions are
available. Rehearse the exact migration/grant/restore procedure before selecting it.

Redis uses AOF and `noeviction`. It is not an authoritative database: Auth0 sessions
are encrypted cookies and permanent business/audit data is in PostgreSQL. Its loss
currently loses no application job/session state. Future BullMQ activation needs its
own durability, replay and queue-draining verification. Do not expose unauthenticated
private Compose Redis to the Internet or an untrusted shared network.

## 3. Topology options (no provider selected)

| Option | Components and starting resources | Operations / backup / failure domain | Portability, growth and Timescale fit |
| --- | --- | --- | --- |
| **A. Single Linux VM** | 2 vCPU / 4 GiB / 80 GiB SSD; Compose edge/Web/API/DB/Redis; one-shot migrator; idle services off | Least deployment machinery; operator owns OS, TLS renewal, DB, off-host dumps and recovery. One host failure stops the entire pilot. No HA. | Direct fit for the tested Compose and Timescale image. Later move DB to a compatible separate host/service, then split app/ingress capacity. Portable across Türkiye/EU hosts. |
| **B. Application VM + managed Timescale-compatible DB** | App VM about 2 vCPU / 3–4 GiB / 30–40 GiB SSD; DB about 1–2 vCPU / 2–4 GiB / 20–30 GiB data; private Redis on app VM initially | Adds private networking/TLS and managed-role compatibility work. Provider backup/PITR must be enabled and restored, not assumed. App host and DB are separate failure domains; neither implies HA. | Same app images; Compose override/release adaptation needed for external DB and local dependency removal. Straightforward only after the extension/privilege gate above. Private endpoint preferred. |
| **C. Managed long-running containers + compatible DB** | Web 768 MiB, API 1 GiB; private DB as B; private Redis roughly 128–256 MiB; platform TLS/ingress, one-off migration job | More platform wiring: runtime secrets, private DNS/egress, health, graceful shutdown, job ordering and logging. Backups remain a separate DB/storage responsibility. Failure domains depend on configured replicas/zones, not the word “managed”. | Images remain portable, platform manifests are not yet implemented. Confirm amd64 support, no function/request-duration mismatch, verified DB privileges and private networking. Public TCP ingress support may differ from HTTPS ingress. |

A is the direct fit for the implemented release path; B can reduce DB operations if
compatibility is proven; C is reasonable when a selected platform removes enough
operational work to justify the extra configuration. No Kubernetes is required. No
current price, regional availability or service entitlement is assumed.

All three can accommodate a later **separate authenticated telemetry ingress**.
A/B can publish an explicitly approved ingress port on a dedicated service/VM; C
must support the selected future protocol (HTTPS or raw TCP). This does not mean
such a listener, device credential system or hardware integration exists today.

## 4. Network, DNS and region boundaries

```text
Browser -- HTTPS 443 --> <staging-app-domain> / TLS edge
                                  |
                             Web :3000
                                  |
                      private API :3001
                                  |
                    private PostgreSQL :5432
                    (business + TimescaleDB)

Private Redis :6379    Optional idle worker :3003 / telemetry :3002
Web/API outbound HTTPS --> staging Auth0 discovery, JWKS and token/userinfo services
Operator --> restricted SSH/VPN; backup agent --> private/off-host backup destination
```

Only **one public application DNS name** is required now:
`https://<staging-app-domain>`. Set `PUBLIC_HOST` to its hostname without scheme;
`APP_BASE_URL` to its HTTPS origin without a path. Configure an A/AAAA record or a
platform CNAME as appropriate after selecting a target; do not publish unusable IPv6.
No final domain has been chosen.

The browser uses `/api/backend/...`; the server-side Web bridge uses
`API_BASE_URL=http://api:3001` inside Compose. **A public API hostname is not needed.**
The Auth0 API audience is an identifier, not a network endpoint that requires DNS.
External/non-Compose API URLs must use HTTPS under the current config validator.

Keep API 3001, Web 3000, PostgreSQL 5432, Redis 6379, idle health 3002/3003 and any
migrator private. Publish only edge 443. Restrict host SSH 22 to the chosen operator/
deployment path (VPN, bastion or approved allowlist); never expose database ports for
bootstrap. Certificate issuance/renewal is an operator/platform responsibility;
current Compose does not serve ACME HTTP challenges or automatically open port 80.
Use DNS validation or the chosen TLS service, or deliberately design an HTTP challenge
path later. Preserve TLS validation; do not use insecure smoke options.

`https://<staging-telemetry-domain>` is a **future** placeholder, not a DNS/listener
requirement for this release. A future proprietary TCP endpoint may need a different
port/protocol. Public device ingress must route to an authenticated adapter, never to
PostgreSQL, Redis, internal health ports or general business API routes.

### Türkiye / EU portability

No application rule requires Türkiye hosting or declares foreign hosting permissible.
The VM/container/DB format is portable. Location decisions must explicitly cover:

| Surface | Location/access decision needed |
| --- | --- |
| PostgreSQL/TimescaleDB and replicas | Business PII, device history, GPS and tenant-linked telemetry currently share one database; choose physical region and operator access together |
| Backups, WAL and restore targets | Off-host location, replication, support access, encryption and restore testing may cross regions independently of the primary DB |
| Auth0 | Tenant region, identity metadata, support and authentication traffic are an independent hosting boundary; a Türkiye VM does not make Auth0 Türkiye-resident |
| Logs/monitoring | Collector region, retention and support access; logs are minimized but still need a location/access decision |
| Object storage if later enabled | Region, replication, access control and encryption; no application bucket is needed now |
| Telemetry ingress/network | Listener region, cellular routing/latency, carrier connectivity and future provider-cloud locations |
| CI/release artifacts | Source/images and synthetic verification diagnostics use GitHub; do not upload live dumps, secrets or real-user browser traces |

Telemetry and identity/business models are conceptually separate, but share relational
links, runtime data access and backups today. This is **not** physical PII separation
or anonymization; location traces can become identifying when linked to users/assets.
Separate physical storage would need a deliberate architecture decision, not a hosting
toggle. Review the actual dataset and applicable obligations before production; this
document supplies no legal conclusion. Reopen ADR-011 before claiming strict identity
data residency that the selected Auth0 offering cannot satisfy.

## 5. Exact manual staging Auth0 checklist

Follow ADR-011 and docs/26: prefer a **separate staging Auth0 tenant**, with its own
API, Regular Web Application, dedicated test identities and secrets. Tag it Staging.
Auth0 recommends a tenant per environment in its
[multiple-environments guidance](https://auth0.com/docs/get-started/auth0-overview/create-tenants/set-up-multiple-environments).
Separate apps/APIs inside a shared non-production tenant are a less isolated alternative:
users, connections, MFA, Actions and identity-provider sessions remain shared. Accept
that tradeoff explicitly before departing from the documented separate-tenant plan.
Do not modify the existing development tenant automatically.

Let `APP` mean the selected `https://<staging-app-domain>` origin.

1. Create/select the staging tenant in the deliberately chosen region. Record its
   actual domain; do not infer it from the application hostname. A custom Auth0 domain
   is optional; if selected, use it consistently for issuer, discovery and Web config.
2. **Applications → APIs → Create API:** choose a staging-only API identifier and copy
   it as `AUTH0_AUDIENCE` in API/Web. Set **RS256**. Keep the Auth0 access-token profile
   compatible with the adapter's required `azp` authorized-client claim; do not switch
   token dialects without verification. Enable **Allow Offline Access** for refresh.
3. **Applications → Applications → Create Application:** choose **Regular Web
   Application**. Copy Domain, Client ID and Client Secret to the Web config. Copy
   that Client ID to API `AUTH0_ALLOWED_CLIENT_IDS`. No tenant authorization, Auth0
   Organizations or provider roles are needed; PostgreSQL remains authoritative.
4. Set **Allowed Callback URLs** to `APP/auth/callback`, **Allowed Logout URLs** to
   `APP`, **Allowed Web Origins** to `APP`, and **Application Login URI** to
   `APP/auth/login`. Use exact HTTPS values, no wildcard. No separate API browser CORS
   origin is required. Do not add native callbacks during the deferred mobile rollout.
5. Enable the required connection(s), Universal Login and authorization-code/refresh
   grants. The Web SDK requests `openid profile email offline_access` with PKCE.
   Do not enable Resource Owner Password Grant or implicit flow to simplify testing.
6. Enable refresh-token rotation and reuse detection. The existing local guide's
   starting policy is 600-second access tokens, 28,800-second maximum refresh life,
   3,600-second idle refresh life and 5-second rotation overlap. Review these as an
   explicit staging policy, not Auth0 defaults. App sessions remain 8 hours absolute,
   1 hour inactivity. See [Auth0 rotation configuration](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-rotation).
7. Configure email verification and password recovery for the selected connections.
   Verify the second staging user's email through the provider's actual flow before
   invitation acceptance. Do not force a verification flag to bypass the test.
8. Apply the initial staging MFA policy from the auth guide: require MFA (Always)
   with an available authenticator factor; confirm entitlement and recovery behavior.
   Verify operator and tenant sign-in manually. Backend permission checks do not
   substitute for MFA, and per-action step-up is not implemented.
9. Set API `AUTH0_ISSUER` to the exact HTTPS issuer ending in `/`. Set Web
   `AUTH0_DOMAIN` to the matching hostname (no scheme). Generate a **fresh 32-byte,
   64-hex-character `AUTH0_SECRET`** for staging; it is not copied from Auth0.
10. Use dedicated staging identities, not personal credentials in scripts. Verify
    login/logout/re-login and `/me` after bootstrap/onboarding. The same email in a
    different issuer is not an identity link. No Management API token is required.

All permanent hosted callbacks stay HTTPS. Section 8 describes the temporary
loopback exception needed by the already-approved operator CLI, with removal afterward.
Real staging Auth0/MFA remains unverified until these manual steps run.

## 6. Complete staging configuration inventory

Use `infrastructure/deployment/*.env.example`, not root development `.env`. Values
below are categories/placeholders only. `R` means required for that component;
`O` optional; `C` conditional. “Non-secret” values still need environment integrity.
Runtime files belong under the deployment's ignored/operator-owned `local/`, mode 0600
or equivalent platform injection. Never log rendered Compose config containing secrets.

### DATABASE

| Variable | Secret? / need | Source | Consumer |
| --- | --- | --- | --- |
| `DATABASE_URL` (runtime) | Secret / R | Restricted staging login created by migrator; URL-encoded password | API; temporary trusted bootstrap CLI |
| `DATABASE_URL` (owner) | Secret / R | Operator/database provisioning; separate credential | One-shot migrator only |
| `DATABASE_NAME` | No / R | Chosen staging database, matches URL path | API, migrator |
| `POSTGRES_DB` | No / C | Same database name for bundled PostgreSQL | PostgreSQL entrypoint |
| `POSTGRES_USER` | No / C | Chosen DB owner for bundled PostgreSQL | PostgreSQL entrypoint |
| `POSTGRES_PASSWORD` | Secret / C | Fresh strong owner password | Bundled PostgreSQL; forms owner URL |
| `RUNTIME_DATABASE_USER` | No / R | Dedicated non-owner staging login name | Migrator |
| `RUNTIME_DATABASE_PASSWORD` | Secret / R | Fresh random value, at least 32 characters | Migrator; forms API runtime URL |
| `INITIALIZE_DATABASE` | No / R | `1` only for first empty deployment, then `0` | Migrator |

Remote DB URLs require `sslmode=verify-full` and trusted certificates; only the
literal private Compose hostname `postgres` permits plaintext. Managed services
must satisfy the role/extension gate. Do not put owner credentials in Web/API.

### REDIS

No Redis URL/password is currently consumed by deployed application services.
Root `REDIS_URL` is reserved configuration, **not** a staging dependency to invent.
Bundled Redis is private `redis:6379` with AOF volume and no public port. Managed
Redis credentials/TLS and a consumer configuration are future gates if queues or
cache are activated; no production session data resides here today.

### AUTH0

| Variable | Secret? / need | Source | Consumer |
| --- | --- | --- | --- |
| `AUTH0_DOMAIN` | No / R | Actual staging tenant/custom-domain hostname | Web; temporary bootstrap CLI |
| `AUTH0_CLIENT_ID` | No / R | Staging Regular Web Application | Web; temporary bootstrap CLI |
| `AUTH0_CLIENT_SECRET` | Secret / R | Same application's settings | Web; temporary bootstrap CLI only |
| `AUTH0_AUDIENCE` | No / R | Staging custom API identifier | Web, API, bootstrap, smoke |
| `AUTH0_ISSUER` | No / R | Exact trusted HTTPS issuer with trailing `/` | API, bootstrap, smoke |
| `AUTH0_ALLOWED_CLIENT_IDS` | No / R | Comma-separated allowed IDs; Web only initially | API, bootstrap |
| `AUTH0_SECRET` | Secret / R | Fresh generated 32-byte session key encoded as 64 hex characters | Web only |

Do not add `AUTH0_COOKIE_DOMAIN` or broaden cookie path; host-only Secure/HttpOnly,
SameSite=Lax, Path=/ is enforced. Native `EXPO_PUBLIC_AUTH0_*` values are deferred.

### APPLICATION

| Variable | Secret? / need | Source | Consumer |
| --- | --- | --- | --- |
| `NODE_ENV` | No / R | Fixed `production`, including staging | All production artifacts |
| `DEPLOYMENT_ENV` | No / R | `staging` | Web/API/migrator/optional idle services |
| `DEPLOYMENT_ID` | No / R | Fresh staging UUID, same across services and DB binding | Web/API/migrator/idle services |
| `APP_BASE_URL` | No / R | Exact selected HTTPS origin | Web, API origin validation |
| `API_BASE_URL` | No / R | `http://api:3001` on private Compose network | Web only |
| `HOST`, `API_PORT` | No / O | API template `0.0.0.0`, `3001`; do not publish | API; `HOST` also idle services |
| `HOSTNAME`, `PORT` | No / image-owned | Image defaults `0.0.0.0`, `3000` | Standalone Web |
| `NEXT_TELEMETRY_DISABLED` | No / image-owned | `1` disables Next.js framework usage reporting | Web image/build; unrelated to machine telemetry |

Never set any `RENTAL_E2E*` value in staging/production. Images reject it; no test
identity header, session substitute or impersonation endpoint is allowed.

### TELEMETRY

| Variable / setting | Secret? / need | Source | Consumer |
| --- | --- | --- | --- |
| `TELEMETRY_FRESH_SECONDS` | No / O | API template/default `300`; finite positive seconds | API telemetry/operations reads |
| `TELEMETRY_PORT`, `WORKER_PORT` | No / O | Defaults 3002 / 3003; only optional idle profile | Telemetry / worker health processes |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Public / O, leave unset | Approved map style only after CSP/data-sharing review; Next build-time value, not a secret | Web map; bundled same-origin map is default |
| Provider/device credentials | Secret / deferred | Future verified adapter provisioning | No production ingress consumes these today |

No SIM808-specific config, token or port is introduced. Do not run the development
simulator against staging by changing `NODE_ENV`; see section 11.

### OBSERVABILITY

JSON stdout/stderr and request IDs are implemented; platform log collection, region,
retention, alert destination and access credentials remain external decisions. No
active `SENTRY_DSN` or OTel exporter variable is consumed today; do not pretend merely
setting one enables collection. Configure health/5xx/latency/restart/OOM/disk/DB
connection/backup-age alerts at the host/platform. Compose log rotation is 10 MiB × 3
files per service. Never enable SQL parameters, auth debug logging, request-body
capture or real-user HAR/trace uploads.

### STORAGE

| File/credential | Secret? / need | Source | Consumer |
| --- | --- | --- | --- |
| `local/tls/fullchain.pem` | No / R for Compose edge | Selected certificate issuer | NGINX read-only mount |
| `local/tls/privkey.pem` | Secret / R for Compose edge | Certificate issuance | NGINX UID 101 with restricted read access |
| PostgreSQL/Redis volumes | Sensitive data / R | Persistent host volumes or selected managed service | DB / Redis |
| Backup destination credentials and encryption key | Secret / R before operational handover | Chosen off-host backup system; keys recoverable separately | Operator/backup agent, not Web |
| S3/object-storage configuration | Deferred | Not required for current in-memory exports | None today |

### DEPLOYMENT

| Variable / setting | Secret? / need | Source | Consumer |
| --- | --- | --- | --- |
| `DEPLOYMENT_NAME` | No / R | Distinct Compose project per environment | Compose resource/volume naming |
| `PUBLIC_HOST` | No / R | Selected app DNS hostname without scheme/path | Compose/NGINX |
| `HTTPS_PORT` | No / O | Default `443` | Compose edge publication |
| `IMAGE_PREFIX` | No / O | Default `rental` with existing archive flow | Compose |
| `IMAGE_TAG` | No / R | Verified full 40-character commit SHA | Compose/release |
| `NGINX_ENVSUBST_OUTPUT_DIR` | No / Compose-owned | `/tmp` | Non-root edge startup |
| `STAGING_HOST`, `STAGING_SSH_USER` | No / C | Chosen target/dedicated deployment account | Optional GitHub staging Environment deployment job |
| `STAGING_SSH_KEY` | Secret / C | Dedicated deployment key | Same job; never an app container |
| `STAGING_KNOWN_HOSTS` | Public host-key material, integrity-critical / C | Independently verified host key; stored as GitHub Environment secret | Strict SSH verification |
| `STAGING_ORIGIN` | No / R for smoke | Selected HTTPS app origin | GitHub variable / smoke process |
| `STAGING_AUTH0_ISSUER`, `STAGING_AUTH0_AUDIENCE` | No / C | Staging issuer/API identifier | GitHub variables mapped to smoke `AUTH0_ISSUER`/`AUTH0_AUDIENCE` |

GitHub's built-in token reads source/Actions artifacts; the current image archive
flow requires no container-registry credential. If a registry/platform is later
selected, add its scoped deployment credentials then. No CA verification bypass is
acceptable; the disposable container test's synthetic CA is not a staging setting.

## 7. Future first deployment sequence

**Do not execute until infrastructure, DNS, Auth0 and secrets are explicitly chosen.**
This is the exact existing single-host path (A); B/C need a reviewed deployment adapter.

1. Provision maintained Linux amd64 with the chosen resource budget, encrypted disk,
   Docker Engine/Compose plugin, restricted operator access, firewall and patch owner.
   Verify time synchronization and available space. Use a staging-only host/database.
2. Configure the selected app DNS name. Configure valid TLS, private-key permissions
   for edge UID 101, renewal and expiry monitoring; no wildcard cookie or public API.
3. Prepare `/opt/rental-staging`, `compose.yaml`, `nginx.conf.template`, `release.sh`,
   `.env`, `local/{postgres,migrator,api,web}.env` and `local/tls/` from the safe templates.
   Keep secrets private, out of shell arguments, CI artifacts, Git and rendered logs.
   Set common staging `DEPLOYMENT_ID` and database name, separate owner/runtime passwords.
4. Complete section 5's staging Auth0 setup and enter the actual environment values.
5. Select an exact green commit. Use **Prepare or deploy staging** with that 40-character
   SHA and `deploy=false` first; it builds/tests all images and provides `staging-release`
   (`images.tar` and release files; artifact retention three days). No deploy target is
   needed for artifact preparation. Alternatively build the same targets in trusted CI.
   Current hosted artifacts are Linux amd64; verify separately before choosing ARM.
6. Transfer/load immutable images, preserving a known-good rollback version. With
   the archive at `/opt/rental-staging/images.tar`, run from that directory:

   ```sh
   docker load -i images.tar
   docker compose --env-file .env -f compose.yaml up -d --wait postgres redis
   docker compose --env-file .env -f compose.yaml exec -T redis redis-cli ping
   ```

   PostgreSQL's health check runs `pg_isready`; Redis must return PONG. Neither probe
   proves schema/application readiness yet. Check volume placement and firewall.
7. Set `INITIALIZE_DATABASE=1` **only for this empty database's first deployment**.
   Run explicit migrations and system seed:

   ```sh
   docker compose --env-file .env -f compose.yaml run --rm migrate
   docker compose --env-file .env -f compose.yaml run --rm migrate operations/database.mjs status
   ```

   The migrator runs Prisma **`migrate deploy`**, binds the database, provisions/re-grants
   the restricted runtime role and runs the **idempotent system-only permission seed**.
   No users, E2E personas or business records are seeded. Failure stops deployment.
   Return `INITIALIZE_DATABASE` to `0`. Keep historical migrations unchanged. Runtime
   cannot change audit history/deployment binding/schema; owner credentials stay separate.
8. Start the application after migration succeeds:

   ```sh
   docker compose --env-file .env -f compose.yaml up -d --wait --wait-timeout 120 api web proxy
   ```

   Worker/telemetry are intentionally off; `--profile idle-services ... up -d --wait
   worker telemetry` is optional health-process testing only. It does not enable jobs
   or provider ingress. API `/ready` validates DB connectivity/binding/privileges;
   Web `/ready` checks the private API. Do not bypass an unhealthy dependency.
9. Run the public read-only smoke below. The optional reviewed GitHub `staging`
   Environment SSH job performs the same release ordering and external smoke; configure
   reviewers, branch restrictions, variables, host-key pinning and secrets before enabling
   `deploy=true`. The script does not select infrastructure or obtain TLS certificates.
10. Provision the initial platform operator through section 8. Verify `/me` has
    `platform.organization.create` and no tenant memberships. Create a labelled staging
    organization and dedicated second test identity using ordinary onboarding/invitations.
11. Run authenticated staged smoke (section 9), including tenant/platform separation.
    Keep real UM Kiralama production/pilot data separate from disposable test records.
12. Enable and verify encrypted off-host backup, then **restore separately into a new
    isolated target**. Verify data, TimescaleDB and immutable audit behavior before
    declaring recovery ready. Record recovery timing and actual retention evidence.

`release.sh` automates image load → dependencies → migration/seed → API/Web/edge →
Redis check. It does not initialize operator identities, issue certificates, schedule
backups or run authenticated smoke. Stop on failures; never use `migrate dev`, `db push`,
database reset or `down -v`. Revert an app image only if compatible with the applied
additive schema. Failed migrations need diagnosis/reviewed recovery, not blind resolve.

## 8. First platform operator

Reuse `apps/api/src/bootstrap-platform.ts` and the verified-identity transaction;
there is no public admin bootstrap route. It requires an interactive terminal,
`--subject`, `--confirm`, a fresh Auth0 authorization-code/PKCE login and matching
verified issuer/subject. It refuses a previously bootstrapped environment, creates
audited PlatformAccess only, and does not grant organization membership or link by email.

The current CLI callback is fixed to **`http://127.0.0.1:43187/callback`**. Run it on a
trusted operator workstation with the browser, not by publishing that port on the
staging host:

1. Use a clean, verified checkout/build of the same release on the trusted workstation.
   Obtain the intended staging Auth0 User ID/subject from the staging dashboard after
   a real verified-email sign-in. It is not the development tenant's subject by assumption.
2. Establish private DB access via approved VPN or an SSH tunnel bound only to loopback,
   targeting the staging private DB. Do not add a public PostgreSQL listener. Keep DB TLS
   verification for a remote TLS endpoint; tunnel configuration must preserve certificate
   hostname validation where TLS is used. Do not pass credentials on a command line.
3. Create a restricted, temporary **staging-only** environment file outside the repository
   with runtime `DATABASE_URL`, staging Auth0 issuer/audience/allowed client IDs and
   domain/client ID/client secret, `NODE_ENV=production`, `DEPLOYMENT_ENV=staging`,
   `DEPLOYMENT_ID` and `DATABASE_NAME`. It must use
   the restricted runtime DB login, not the owner account. Verify the destination through
   a read-only query of `current_database()` and `DeploymentIdentity` against the approved
   staging name/environment/UUID. The existing CLI does not perform that deployment-binding
   preflight itself; do not assume the app's startup guard covers this workstation command.
4. Temporarily add the loopback callback above to **only the staging Web application**.
   Keep the permanent HTTPS callback. Open a fresh terminal with no development credential
   variables inherited (process environment overrides `--env-file`). From the verified root:

   ```sh
   node --env-file=<private-staging-bootstrap.env> apps/api/dist/bootstrap-platform.js --subject '<verified-staging-subject>' --confirm
   ```

   Use the browser URL shown by the CLI, complete real authentication/MFA, then check its
   success message. Tokens/codes stay in the process. Do not use the root local-development
   `pnpm --filter @rental/api bootstrap:platform` wrapper here: its environment-file
   loading is for development.
5. Immediately remove the loopback callback, close private access and securely remove the
   temporary credential file. Never copy cookies/tokens into chat, reports or CI. Verify
   hosted `/api/backend/me` shows the platform permission and an empty organization list.

The loopback exception is time-bounded to the approved administrative flow; no deployed
HTTP callback, permanent bypass or manual access-grant SQL is added. A platform operator
does not become a tenant admin: invite a separate staging user through ordinary onboarding.

## 9. Staging smoke suite (non-destructive)

Keep this distinct from `pnpm test:e2e` and `pnpm test:deployment`, which own disposable
resources. **Never aim those destructive fixture lifecycles at staging.** Staging uses
the production Auth0 adapter; test headers/cookies and `RENTAL_E2E*` are prohibited.

### Automated public/readiness smoke — already implemented

From a trusted Node 24 environment with these three **non-secret** values configured:

```sh
STAGING_ORIGIN='https://<staging-app-domain>' \
AUTH0_ISSUER='https://<actual-staging-auth0-domain>/' \
AUTH0_AUDIENCE='<actual-staging-api-identifier>' \
node infrastructure/deployment/smoke.mjs
```

Equivalent workspace command: `pnpm smoke:staging`. It checks HTTPS Web/ready/dashboard,
static JS, unauthenticated `/api/backend/me` = 401, nonexistent impersonation routes = 404,
CSP/HSTS, Auth0 issuer/audience/callback/PKCE redirect and Secure/HttpOnly/SameSite cookies.
It does not sign in, reset a DB or create data. Web `/ready` indirectly checks API/DB;
use the private deployment Redis PING as a separate check. Synthetic container CI has
tested this script; it has not run against a real staging hostname yet.

### Authenticated suite — run after manual staging sign-in

Use a dedicated browser profile and dedicated staging account; let the human complete
Auth0/MFA. No password automation, exported storage state, saved access token or E2E
identity substitution. This table is the exact manual authenticated complement to the
automated public script, **not a claim of automated real-user verification**. Run with
a tenant administrator, then the separate platform operator and a limited/no-finance
member. Use `/api/backend/organizations/<organizationId>` as `O`, taking the ID only
from the current authenticated `/me`. Do not print API bodies with personal/financial data
into shared diagnostics; record route/status and pass/fail instead.

| Check | Action and expected result |
| --- | --- |
| Identity / tenant context | Open `/api/backend/me`: intended stable application user and only permitted organizations/permissions. Tenant admin has no platform permissions; platform-only operator has no tenant business access. |
| Dashboard/navigation | Open `/dashboard`, switch permitted organizations, reload; scope and EN/TR labels persist correctly; hidden organization data never appears. |
| Customers read | `/customers`; search; authenticated `GET O/customers?limit=5` succeeds for allowed user. Empty DB shows an empty state, not a session failure. |
| Optional Customer write | Only under the explicit opt-in procedure below; save in UI, read by returned ID, then archive that disposable record if approved. |
| Machines read | `/machines`; `GET O/machines?limit=5`; open an existing allowed machine; selected-branch member cannot read a known other-branch test record. |
| Rentals read | `/rentals`; `GET O/rentals?limit=5`; existing read/detail screens work; no reserve/dispatch/cancel mutation required for staging smoke. |
| Maintenance read | `/maintenance`; `GET O/maintenance?limit=5` and `GET O/maintenance/plans`; read details/plans without generating work orders. |
| Finance read | `/finance`; `GET O/finance?preset=THIS_MONTH&limit=5`; permitted values remain ESTIMATE_V1-labelled. No-finance persona receives denial/redaction, not hidden JSON costs. No receivable/settlement mutation. |
| Settings read | `/settings`; `GET O/settings` for ALL_BRANCHES plus required organization permission. Limited persona is denied according to existing administration rules. |
| Telemetry read | `/devices` and allowed Machine detail Telemetry; `GET O/devices?limit=5` and `GET O/machines/<machineId>/telemetry`; absent data shows unknown/unavailable, never a fabricated live value. Use existing evidence only until staging ingestion is enabled. |
| Logout/re-login | Logout, `/api/backend/me` returns 401; real login again resolves same user/membership. Verify permanent callback/logout origins and removal of bootstrap callback. |

Permission denial is an expected result for a restricted persona, not grounds to grant
broader access. Full conflict/workflow mutation regressions remain in the isolated
57-scenario Playwright suite and can grow there without touching staging pilot records.

**Optional disposable Customer mutation:** require the owner to explicitly enable it
for a named staging organization and run ID. Use `STAGING-SMOKE-<run-id>` as the exact
display/legal name, no real PII, and the ordinary shared-schema UI fields. Search exact
name first; reuse the same confirmed ID for a rerun. Run only one operator/runner for
that ID. If create's response is uncertain, inspect the list before retrying POST.
The Customer API does not provide an idempotency key and names are not unique; a label
alone does not create a concurrency guarantee. Record only the created ID/run marker.
Cleanup is the existing authorized archive action for that exact run-owned record,
after checking it has not been adopted by pilot work. Preserve history/audit; never
bulk-delete prefixes, reset the database or manipulate tables directly.

## 10. Backups, monitoring and operational acceptance

Adopt or revise the proposed policy from docs/26 before pilot data matters: encrypted
daily full logical backups, 7 daily / 4 weekly / 12 monthly recovery points, off-host
under separate credentials. Daily-only means up to 24 hours of loss. Accept that
explicitly for disposable staging or enable operated/managed WAL/PITR before relying
on real operations. Proposed RPO ≤15 minutes / RTO ≤4 hours are **unproven targets**.
Provider snapshots alone are not evidence of a working database/application restore.

Full PostgreSQL custom-format backup must include Timescale data, business records,
AuditEvent and deployment metadata. Keep compatible versions. Restore into a **new
isolated target**, enable TimescaleDB, use `timescaledb_pre_restore()`, restore with
`pg_restore --exit-on-error` (no parallel `-j`), then `timescaledb_post_restore()`.
Validate counts, foreign keys, hypertables, audit immutability and restricted runtime
readiness. Roles/passwords/keys need a separate recovery path. Database binding must
not be casually copied to a different environment; reviewed isolated rebinding and
data sanitization are operator procedures, not runtime capabilities. See the tested
[backup procedure](26-STAGING-PRODUCTION-READINESS.md#8-backups-and-restore) and
[Timescale reference](https://www.tigerdata.com/docs/deploy/self-hosted/backup-and-restore/logical-backup).

Before pilot handover, configure log collection/access/retention, TLS expiry, health,
error/latency, resource usage, DB space/connections, backup-age and failed-restore alerts;
name an on-call/operator contact and patch owner. Existing stdout hooks do not themselves
send alerts. No email provider is selected. Check representative list/finance/export
performance before raising load; fixture timings do not establish a fleet/user limit.
Keep at least 20% disk free and investigate growth before running out, particularly
because telemetry/fault/installation history has no automatic deletion policy.

## 11. Simulator and future SIM808 experiment

The canonical pipeline and historical installation resolution already accept normalized
GPS, speed and other signals from a trusted adapter binding. Future topology can support:

```text
Prototype + Turkish SIM/GPRS --> Internet --> authenticated staging ingress adapter
  --> trusted device/tenant binding --> existing ingestion application
  --> TimescaleDB/current read models --> authorized Web UI
```

**Topology-compatible is not ingress-ready.** Current telemetry HTTP serves only idle
health; no production device listener exists. The existing simulator CLI explicitly
rejects `NODE_ENV=production` and non-loopback DB hosts. Staging images correctly use
production mode. Do not override that safeguard, open a simulator endpoint or write
telemetry tables directly to populate staging. Browser regression remains verified
with isolated synthetic ingestion. A small **separately authorized staging-only runner
or secured adapter** calling the same ingestion application is a remaining gate if
live synthetic updates are required during the staging pilot; no such runtime change
is implemented by this planning task.

Before a physical experiment, verify the exact SIM808 board/firmware and carrier:
GPRS/2G availability, APN and outbound Internet, DNS, time, TLS/certificate validation
and SNI compatibility with the chosen listener. Do not assume a legacy modem can
connect to the current TLS 1.2/1.3 edge, or weaken the web TLS policy to accommodate it.
If needed, choose compatible hardware/a secure gateway through a separate decision.
No claim about current carrier coverage or module security support is made here.

The later ingress must authenticate a provisioned device/account using a reviewed
credential mechanism; IMEI/device identity alone is not authentication. Apply payload/
rate limits, replay/event identity checks, malformed/future-time validation and safe
credential provisioning/rotation. Derive organization/device server-side and machine
from `DeviceInstallation` at `recordedAt`. Preserve recorded vs received timestamps,
idempotency, per-signal provenance and source resolution; payloads cannot choose an
arbitrary tenant/machine. Never embed secrets in URLs or retain raw credentials.

Payload concepts may include device identity, recordedAt, latitude/longitude, GPS speed
and later canonical CAN-derived values. Actual transport/schema and hardware CAN
acquisition remain to be verified; this plan implements neither a SIM808 client nor a
Ruptela/Xtellio decoder. Future public ingress requires its own hostname/protocol/firewall
rule, authenticated adapter tests and hardware demonstration. No database/internal API
exposure, new MQTT broker, remote command or geofencing is justified by this experiment.

## 12. Decisions and acceptance gates remaining

- Choose topology A/B/C, provider and physical region(s); approve the small initial
  resource budget and managed Timescale/role compatibility if relevant.
- Choose app domain, DNS/TLS issuance/renewal and restricted deployment/operator path.
- Create separate staging Auth0 tenant/API/Web app and dedicated accounts; configure
  MFA/verification, generate staging secrets and approve bootstrap private access.
- Decide acceptable data loss/recovery time, backup regions/retention, encryption-key
  custody, restore frequency, monitoring destination and patch/operator ownership.
- Configure GitHub `main` protections and, if used, `staging` Environment reviewers and
  deploy credentials. Artifact preparation remains non-deploying by default.
- Approve any disposable staging Customer mutation; all other smoke checks are reads.
- Authorize a staging-safe simulator/ingress follow-up only if needed. Obtain real
  modem/provider documentation and connectivity evidence before physical telemetry.

No cloud resources, DNS, Auth0 settings, database contents or provider credentials were
changed to produce this plan. No new business domain was started. Hosted integration
verification is tracked on PR #1; actual staging smoke, real staging identity login,
off-site backup recovery and hardware ingress must be recorded after execution.

Related: [production readiness](26-STAGING-PRODUCTION-READINESS.md),
[E2E isolation](19-E2E-TESTING.md), [telemetry foundation](20-TELEMETRY-FOUNDATION.md),
[local Auth0/bootstrap guide](14-AUTH0-LOCAL-VERIFICATION.md),
[security](10-SECURITY.md), [architecture](02-SYSTEM-ARCHITECTURE.md), ADR-008,
ADR-010 and [accepted Auth0 ADR](decisions/ADR-011-OIDC-AUTHENTICATION-PROVIDER.md).
