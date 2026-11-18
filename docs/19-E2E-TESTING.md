# Automated browser verification

## Purpose and boundaries

Playwright runs the real Next.js pages, server-side API bridge, NestJS application,
validation, repositories and PostgreSQL authorization models. Auth0 remains the
normal development/production provider. Browser tests substitute identity verification
only; they do not test Auth0's hosted login, MFA, social connections or mobile callbacks.
Those external integrations retain their separate provider verification checklist in
[the Auth0 local guide](14-AUTH0-LOCAL-VERIFICATION.md).

## Isolation and authentication

All harness code lives under `tests/e2e`. The runner creates a temporary copy of the
web application in ignored `.e2e/web`, excluding environment files and build output.
Only that copy receives the test session adapter. The normal web session adapter and
production API entry point contain no test switches, impersonation route or dev login.

The test API imports the real NestJS module and overrides its existing IdentityVerifier
and database injection tokens through Nest's testing module. Verified synthetic
issuer/subject pairs resolve through real ExternalIdentity and User records. Permissions
still come from Membership, Role, Permission, BranchScope and PlatformAccess.

Each run generates unpredictable opaque persona credentials in child-process environment
variables. Playwright installs a persona's HttpOnly, SameSite=Strict cookie directly in
its browser context. There is no HTTP endpoint that issues these sessions. No real Auth0
password, client secret or token is required or stored. Email does not select identity.

The test adapters fail closed unless the random run ID, exact run-specific database,
loopback hosts, dedicated ports and complete credential map match. They reject
NODE_ENV=production. The copied Next development server uses this strict dedicated
environment; NODE_ENV=test alone is insufficient. Production artifacts never include
these adapter replacements. Security tests additionally boot the normal production API
with test flags present and prove that test bearer credentials, cookies and headers
remain unauthenticated. Unknown cookies and public impersonation paths are rejected.

This harness assumes a trusted local test process, not an untrusted developer with
arbitrary filesystem/database access. Keep test ports local and never deploy `.e2e`.
Failure traces can contain synthetic test-session data; treat artifacts as private,
short-lived diagnostics even though their credentials expire when the servers stop.

## Database and process lifecycle

Prerequisites: repository Node/pnpm versions, installed dependencies, local PostgreSQL
running, and DATABASE_URL configured locally. The runner reads the connection without
printing it, requires localhost/127.0.0.1, and connects to the administrative `postgres`
database. The database user needs CREATE DATABASE permission.

Every run creates a fresh `rental_e2e_<random 32 hexadecimal characters>` database,
applies all committed Prisma migrations and provisions permissions/templates and fixtures.
The developer's database is never reset. Drop operations accept only that exact E2E
name pattern. Normal exit, test failure and handled termination stop owned child processes
and drop the run database. A local lock prevents concurrent runners sharing artifacts.

Ports 3100 (web), 3101 (test API), 3102 (normal production API security probe) must be
free. The runner refuses to attach to existing unknown processes. API health and web
readiness are checked before tests. Ordinary development ports are unaffected.

If the operating system forcibly kills the runner, inspect/stop its remaining test
processes first. Only after confirming no E2E runner is active, remove the stale
`.e2e/run.lock` file and run `pnpm test:e2e:cleanup`. Cleanup uses the recorded synthetic
database name in `.e2e/state.json`, validates its prefix/shape, and does not reset the
development database. Do not run ordinary database-reset commands to clean E2E data.

## Personas and builders

| Persona | Database authorization |
| --- | --- |
| PLATFORM_OPERATOR | platform.organization.create; no tenant membership |
| TENANT_ADMIN_ALL_BRANCHES | E2E Rental Company; TENANT_ADMINISTRATION permissions; all branches |
| TENANT_LIMITED | Same company; read permissions; North branch only |
| TENANT_NO_FINANCE | Same company; operational permissions, no acquisition/rental-pricing/maintenance-cost grants |
| SECOND_TENANT_ADMIN | Separate organization and administrative membership |

`builders.mjs` provides test-side organization, branch, identity/membership, customer,
machine, rental, work-order and plan builders. Fixtures use deterministic names and
run-local IDs recorded in the manifest; tests do not depend on production IDs or email.
Domain setup uses application services where applicable. Browser mutations exercise
the actual forms; supplemental assertions use the authenticated Next.js API bridge.

## Commands

From the repository root:

```sh
pnpm install
pnpm exec playwright install chromium
pnpm infra:up
pnpm test:e2e
pnpm test:e2e:headed
pnpm test:e2e --grep "calendar plan"
pnpm exec playwright show-report .e2e/report
pnpm exec playwright show-trace <failure-trace.zip>
```

The E2E command builds dependencies, creates/migrates/seeds its database, starts its
servers, runs Chromium headlessly and cleans up. There is no separate manual seed step.
Use `--headed` for interactive debugging and `--grep` or a spec filename for focused runs.
Run `pnpm test` separately for the fast/domain integration suite and full build.
Tests currently run with one worker to avoid shared-fixture interference; adding parallel
workers requires per-worker data isolation. No retries hide failures.

## Coverage and diagnostics

The initial suite covers Customer CRUD/archive and active-customer rental lookup,
Machine CRUD/retirement and branch/cost visibility, Rental reservation/conflict/dispatch/
extension/return/completion/cancellation and machine-state projection, Maintenance
workflow/checklists/costs/restrictions/history, and tenant/platform/financial negatives.

Calendar-plan tests create/select/save/reload targets, edit intervals/due dates, deactivate,
generate linked work orders and verify due filtering and next occurrence. They cover
completion-based days, scheduled month-end clamping, inactive recurrence and repeated
completion. A future plan alone leaves service state NORMAL. Plans do not have an
automatic occurrence generator or a separate calendar-grid view in this version.

PDF/XLSX tests download through the UI and inspect MIME, file size, machine/work-order
content and financial omission. PDF.js plus the canvas renderer produces PNG pages for
visual review; XLSX is parsed with ExcelJS. HTTP 200 alone is not considered success.

`.e2e/report` contains the HTML report; `.e2e/results` contains downloads, rendered PDFs,
failure screenshots and retained failure traces. `.e2e/servers.log` contains server
diagnostics. All are ignored by Git. Traces/screenshots use only isolated synthetic data.

## CI and future work

`.github/workflows/e2e.yml` runs a dedicated browser job with PostgreSQL/TimescaleDB and
Redis services, installs Chromium and uploads diagnostics on failure or success with
short retention. CI credentials are disposable service credentials, not Auth0 secrets.
The workflow runs unit/integration tests, browser tests, lint, strict TypeScript,
formatting and the full build. It runs on pull requests, manual dispatch and pushes to
`codex/verify-telemetry-ci`. Local execution validates the suite; the hosted GitHub job
must also run on the repository before claiming CI passed.

New user-visible workflows require E2E updates and an agent-run relevant browser check
before technical verification is declared. Keep provider login/MFA, real mobile development
builds and other truly external verification explicit; never replace them with a claim
that the synthetic identity harness verified Auth0 itself.

## Verified baseline

Local verification on 2026-10-21 passed 109 unit/integration/security tests and all
17 Chromium E2E scenarios with no retries. Each browser run applied all migrations
to its disposable database. Lint, strict TypeScript, formatting and the full workspace
build passed, including Next.js and Expo iOS/Android exports. Cleanup was verified
after the run. The generated maintenance PDF was rendered and visually reviewed.

Browser investigation fixed plan choice loading and missing edit/deactivation controls,
stale next-due display after completion, advancement of inactive plans, and the differing
completion/recurrence clock reads. It also fixed Machine list navigation retaining the
detail editor. The hosted CI job and external Auth0/mobile login were not executed by
this local verification. A pre-existing non-failing pg concurrent-query deprecation
warning remains; it did not skip or fail tests.
## November 2026 runner recovery

Next 16.4.0 exited after its upgrade notice before the copied web app could serve the
readiness request. Recreating the disposable copy also discarded its local retry receipt.
The web dependency and its lint configuration were patched to 16.4.6. The runner now
reports which server exited and enforces a wall-clock readiness deadline. It still owns
setup, both API processes, Next, Playwright and teardown; no separate pnpm dev is needed.
If Chromium is missing on a clean workstation, run pnpm exec playwright install chromium.
The original 17 scenarios were run successfully before applying the local device migration.
Telemetry scenarios use real ingestion with the isolated database, a short test-only
freshness interval and the packaged MapLibre worker/outline map.

## Hosted verification (2026-11-18)

GitHub Actions [run 44256519656](https://github.com/ogedayyildiz/rental-management-app/actions/runs/44256519656)
passed on `codex/verify-telemetry-ci` at `2bdeaea4ff097cbdb1512338c61488a9d12f900c`.
The Ubuntu runner executed 111 unit/integration/security tests (zero failures or skips),
all 19 Chromium scenarios (no retries), lint, strict TypeScript, formatting and the full
workspace build. Its TimescaleDB/PostgreSQL and Redis services initialized successfully.
The browser-diagnostics artifact contains the report, results and server log with seven-day
retention. Future failures retain traces/screenshots through the same always-run upload.

Clean-run setup selects Node 24 before installing the pinned pnpm version. No local
environment files or Auth0 credentials are needed. This verifies hosted CI, not real
provider hardware, production ingress, or a production deployment. Existing pg/action
runtime deprecation warnings were non-failing; tests and assertions were not weakened.
