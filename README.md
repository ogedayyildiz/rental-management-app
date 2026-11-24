# Rental Management and Equipment Tracking Platform

Multi-tenant SaaS platform for equipment rental operations, fleet management, maintenance, telemetry and operational finance.

> **Project status — 2026-11-24:** The core web platform includes Auth0/onboarding, Customers, Machines, Rentals, Maintenance/plans, simulator-backed Telemetry, Finance/Analytics, operational receivables/payables/settlements, tenant administration, Operations/notifications and rental transportation quotes.
>
> Local and hosted GitHub verification on **2026-11-24** passed **190 unit/integration tests and 55 Playwright scenarios**, plus lint, strict TypeScript, formatting and full build. See the [verification record](docs/19-E2E-TESTING.md#current-verification-baseline) for the tested commit and run; older milestone counts are historical.
>
> Real Auth0 web login, platform bootstrap and tenant onboarding were separately verified. Browser automation uses isolated test personas with real database authorization, not personal Auth0 credentials. Real Ruptela/Xtellio access, production ingress, invitation email delivery, mobile features, remote commands and geofencing remain deferred. Financial estimates and recorded settlements do not constitute statutory accounting or verified bank activity.

See [Machine implementation and smoke test](docs/16-MACHINE-IMPLEMENTATION.md) for state dimensions, branch scope, specifications and acquisition-cost permissions.

See [Customer implementation contracts](docs/15-CUSTOMER-IMPLEMENTATION.md) for permissions, identifiers, addresses, pagination, audit behavior and development-data notes.

See [Staging / Production Readiness](docs/26-STAGING-PRODUCTION-READINESS.md)
for portable production images, environment separation, restricted database roles,
TLS/Auth0 setup gates, migrations, backup/restore, deployment smoke and CI/CD.
No cloud host or real staging deployment is selected by these artifacts.

See [authentication and onboarding setup](docs/13-AUTHENTICATION-AND-ONBOARDING.md)
for required environment values, Auth0 dashboard steps, callback URLs and current
verification limits. The API and web server require Auth0
configuration at startup; no development authentication bypass exists.

For first-time Auth0 setup, follow the [local verification checklist](docs/14-AUTH0-LOCAL-VERIFICATION.md),
including the audited one-time platform operator command and two-user browser/mobile checks.

---

## 1. Product Scope

The platform is designed for rental companies managing construction equipment, access equipment, forklifts, telehandlers, and other serialized machinery.

Implemented web capabilities include:

- organization and branch management;
- user memberships, roles, and permissions;
- customer management;
- machine and fleet management;
- reservations and rentals;
- machine assignment and replacement history;
- maintenance planning and work orders;
- canonical faults, telemetry history and last-known GPS maps using the simulator;
- estimated rental value, contribution, acquisition recovery and utilization analytics;
- explicit VAT terms, approved receivables, acquisition commitments and partial settlements;
- combined transportation quotes and separately permissioned estimated margin;
- maintenance PDF/XLSX and Finance analytics XLSX exports;
- operational dashboard, scoped search and personal in-app notifications;
- immutable audit history and tenant administration.

Real provider decoding/ingress, remote commands, geofencing, statutory accounting,
invoice issuance, automatic email delivery and AI assistance are future scope.

Web is the implemented operational client. React Native/Expo has an authentication
foundation and shared API contracts for iOS/Android; mobile domain UIs and real-device
verification remain deferred.

Initial user-facing languages:

- English;
- Turkish.

---

## 2. Architecture Summary

The platform uses a TypeScript monorepo.

The following is the documented architecture direction, not a claim that every
integration is deployed. The running web/API uses Next.js, NestJS, PostgreSQL/
TimescaleDB, Prisma, Zod, Auth0, MapLibre and ECharts. Redis is available locally;
production queues, object storage, observability and cloud provisioning are not
established by the local test/build baseline.

Architecture stack:

```text
Language:
TypeScript

Repository:
pnpm + Turborepo

Web:
Next.js + React
Tailwind CSS
shadcn/ui

Mobile:
React Native + Expo

Backend API:
NestJS

Database:
PostgreSQL

Time-Series:
TimescaleDB

Cache / Queue:
Redis + BullMQ

Validation:
Zod

Maps:
MapLibre GL

Charts:
Apache ECharts

Object Storage:
S3-compatible storage

Authentication:
OpenID Connect (managed Auth0 behind IdentityVerifier)

Observability:
Sentry + OpenTelemetry

Containers:
Docker

CI/CD:
GitHub Actions

Infrastructure:
Terraform

Initial Cloud Target:
AWS
```

The core business backend follows a **modular monolith** architecture.

Telemetry ingestion is **separately deployable** because machine-driven telemetry traffic has different scaling, networking, protocol, and reliability requirements from normal web/mobile API traffic.

---

## 3. High-Level Architecture

```text
                    USERS

          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼

    WEB APPLICATION       MOBILE APPLICATION
       Next.js            React Native + Expo
          │                     │
          └──────────┬──────────┘
                     │
                     │ HTTPS
                     ▼

               BACKEND API
                  NestJS
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       ▼             ▼             ▼

   PostgreSQL      Redis      Object Storage
   + TimescaleDB              S3 Compatible


TELEMETRY DEVICES / PROVIDERS
            │
            ▼

     TELEMETRY INGESTION
            │
            ▼

      Provider Adapters
            │
            ▼

     Normalized Telemetry
            │
     ┌──────┼────────┐
     │      │        │
     ▼      ▼        ▼

 Timescale  Faults   Current State
```

---

## 4. Repository Structure

Repository structure (implementation guides continue through document 25):

```text
rental-management/
├── AGENTS.md
├── README.md
│
├── docs/
│   ├── 01-PROJECT-OVERVIEW.md
│   ├── 02-SYSTEM-ARCHITECTURE.md
│   ├── 03-DOMAIN-MODEL.md
│   ├── 04-UI-UX.md
│   ├── 05-AUTH-AND-PERMISSIONS.md
│   ├── 06-TELEMETRY-IOT.md
│   ├── 07-RENTAL-BUSINESS-RULES.md
│   ├── 08-MAINTENANCE.md
│   ├── 09-FINANCE-ANALYTICS.md
│   ├── 10-SECURITY.md
│   ├── 11-CODING-STANDARDS.md
│   │
│   └── decisions/
│       ├── ADR-001-MODULAR-MONOLITH.md
│       ├── ADR-002-PROVIDER-INDEPENDENT-TELEMETRY.md
│       ├── ADR-003-SEPARATE-TELEMETRY-INGESTION-SERVICE.md
│       ├── ADR-004-DEVICE-INSTALLATION-HISTORY.md
│       ├── ADR-005-MULTIPLE-TELEMETRY-SOURCES-PER-MACHINE.md
│       ├── ADR-006-SERVER-SIDE-CAN-DECODING.md
│       ├── ADR-007-SEPARATE-MACHINE-STATE-DIMENSIONS.md
│       ├── ADR-008-PERMISSION-BASED-AUTHORIZATION.md
│       ├── ADR-009-REMOTE-COMMAND-SAFETY-MODEL.md
│       ├── ADR-010-POSTGRESQL-TIMESCALEDB.md
│       ├── ADR-011-OIDC-AUTHENTICATION-PROVIDER.md
│       └── ADR-012-OPERATIONAL-RECEIVABLES-AND-PAYABLES.md
│
├── apps/
│   ├── web/
│   ├── mobile/
│   ├── api/
│   ├── telemetry/
│   └── worker/
│
├── packages/
│   ├── domain/
│   ├── database/
│   ├── validation/
│   ├── permissions/
│   ├── api-client/
│   ├── telemetry/
│   ├── i18n/
│   ├── config/
│   └── ui/
│
└── infrastructure/
```

The documented module and dependency boundaries must be preserved. Current web
routes and their implementation guides are indexed in section 20 below.

---

## 5. Documentation

The project documentation is the primary source of truth for architecture and business rules.

### Product and Architecture

- `docs/01-PROJECT-OVERVIEW.md`  
  Product scope, users, modules, goals, and feature boundaries.

- `docs/02-SYSTEM-ARCHITECTURE.md`  
  Technical architecture, applications, services, infrastructure, deployment, telemetry boundaries, and technology choices.

- `docs/03-DOMAIN-MODEL.md`  
  Core business entities, relationships, historical models, and domain invariants.

### UX, Access, and Security

- `docs/04-UI-UX.md`  
  Web/mobile navigation, workflows, interaction patterns, and localization behavior.

- `docs/05-AUTH-AND-PERMISSIONS.md`  
  Authentication, memberships, roles, permissions, invitations, branch scope, and platform-vs-tenant access.

- `docs/10-SECURITY.md`  
  Tenant isolation, secrets, infrastructure security, remote-command security, auditability, backups, and incident readiness.

### Core Business Domains

- `docs/07-RENTAL-BUSINESS-RULES.md`  
  Rental lifecycle, reservations, machine allocation, replacements, partial returns, pricing, availability, and rental history.

- `docs/08-MAINTENANCE.md`  
  Preventive/corrective maintenance, work orders, inspections, service state, maintenance blocks, history, and exports.

- `docs/09-FINANCE-ANALYTICS.md`  
  Revenue attribution, acquisition cost, contribution, ROI, payback, utilization, downtime, and reporting.

### Telemetry and Implementation

- `docs/06-TELEMETRY-IOT.md`  
  Telemetry providers, Ruptela, Xtellio, normalized telemetry, CAN decoding, source resolution, GPS, faults, and remote commands.

- `docs/11-CODING-STANDARDS.md`  
  TypeScript, module boundaries, validation, APIs, database access, tenancy, permissions, money, time, i18n, telemetry, and testing standards.

### Architecture Decision Records

Important architectural decisions are documented under:

```text
docs/decisions/
```

ADRs explain **why** a decision exists and should be read before changing an established architecture pattern.

---

## 6. Agent and Developer Instructions

`AGENTS.md` is the operational instruction file for AI coding agents and developers.

Before changing a domain, read:

1. `AGENTS.md`;
2. the relevant domain document;
3. the relevant ADRs.

Do not silently change established architecture decisions because another implementation appears simpler.

If an architecture decision must change:

1. update or supersede the relevant ADR;
2. update affected documentation;
3. update `AGENTS.md` if the operational rule changes.

---

## 7. Core Architectural Rules

The following rules are foundational:

1. The core business backend is a modular monolith.
2. Telemetry ingestion is separately deployable.
3. Web and mobile applications never access the production database directly.
4. Authoritative business logic is enforced on the backend.
5. Tenant-owned data must always be organization-scoped.
6. Authorization uses permissions, not fixed role names.
7. Platform-level access is separate from tenant membership.
8. A machine and a tracking device are separate entities.
9. Device-to-machine history is modeled through `DeviceInstallation`.
10. A machine may have multiple active telemetry devices.
11. Telemetry provider details must remain behind provider adapters.
12. Provider protocol decoding and machine CAN decoding are separate concerns.
13. Multiple telemetry sources must use explicit source-resolution rules.
14. `recorded_at` and `received_at` are separate telemetry concepts.
15. Rental, service, connectivity, operational, and asset-lifecycle states remain separate.
16. Telemetry must not automatically start or complete legal rental transactions.
17. Fault disappearance does not automatically mean maintenance is complete.
18. Remote-command submission is not proof of physical execution.
19. Financial calculations must not use JavaScript floating-point numbers as the authoritative representation of money.
20. User-facing text must use localization keys.

---

## 8. Telemetry Architecture

The telemetry domain is provider-independent.

Current provider examples:

- Ruptela;
- Xtellio;
- OEM providers;
- future providers.

Core business modules must work with normalized telemetry rather than provider-specific payloads.

### Ruptela

Ruptela devices connect to our telemetry infrastructure using Ruptela's proprietary device-to-server protocol.

Conceptually:

```text
Machine
   ↓
Ruptela Device
   ↓
Cellular Connection
   ↓
Ruptela Proprietary Protocol
   ↓
Telemetry Ingestion Service
   ↓
Ruptela Adapter
   ↓
Configured CAN / GPS / IO Data
   ↓
Machine CAN Decoder where required
   ↓
Normalized Telemetry
```

MQTT is not required for the Ruptela integration.

It may be introduced later for internal messaging or another provider integration if justified.

### Xtellio

Xtellio is treated as a cloud/API integration boundary.

Conceptually:

```text
Machine
   ↓
Xtellio Device
   ↓
Xtellio Cloud
   ↓
API / Streaming Interface
   ↓
Xtellio Adapter
   ↓
Normalized Telemetry
```

Exact Xtellio transport, authentication, signal-profile, and raw-CAN capabilities must follow official provider documentation.

---

## 9. Device and Telemetry History

Do not model a permanent relationship such as:

```text
Machine.device_id
```

Use:

```text
Machine
   ↓
DeviceInstallation
   ↓
TrackingDevice
```

A machine may have multiple active devices.

A physical tracking device should normally have only one active machine installation.

Historical telemetry must resolve the correct machine using the installation valid at:

```text
recorded_at
```

rather than the device's current installation.

---

## 10. Machine State Model

Do not use one generic machine status.

Keep these concepts separate:

```text
Rental State
Service State
Connectivity State
Operational State
Asset Lifecycle
```

Machine availability is derived from relevant domain state and scheduling data.

Examples of invalid assumptions:

```text
Offline = Broken
Returned = Available
Stopped = Rental Ended
Fault Cleared = Repaired
```

---

## 11. Rental Model

The commercial structure is:

```text
Customer
   ↓
Rental
   ↓
RentalItem
   ↓
RentalMachineAssignment
   ↓
Machine
```

A reservation may be created by category/model/quantity before a specific physical machine is assigned.

Machine replacements and partial returns preserve assignment history.

Historical agreed prices must not change when current standard pricing changes.

---

## 12. Maintenance Model

Maintenance is machine-centric.

Key concepts include:

```text
MaintenancePlan
MachineMaintenancePlan
WorkOrder
FaultEvent
Inspection
Service State
```

Not every maintenance item blocks rental.

Blocking behavior is explicit.

Changing tracking device or telemetry provider must not alter machine maintenance history.

Machine maintenance history should be exportable in professional PDF and structured XLSX formats according to permissions and report profile.

---

## 13. Finance and Analytics

The platform provides management analytics and separately approved operational
obligations/settlements rather than replacing a statutory accounting system.

Key metrics include:

- ESTIMATE_V1 contracted, accrued and completed rental estimates;
- acquisition cost;
- maintenance cost;
- estimated contribution before unmodeled costs;
- acquisition recovery estimates;
- calendar rental utilization and rented/unrented time, displayed in Hours or Days;
- separately reported transportation margin excluding VAT.

Currencies remain separate: TL (stored TRY), USD and EUR. ESTIMATE_V1 never creates
customer debt. Approved receivables, acquisition cash/open-account/leasing plans and
partial payments/collections live in Operational Finance. Historical VAT remains
unspecified; absence of an invoice does not imply exemption. Transportation quotes
do not automatically create obligations or count toward machine earnings.

Monetary values require explicit currency and decimal-safe handling.

Financial calculations must be centralized.

---

## 14. Remote Machine Commands

This is the future safety architecture; remote commands are not implemented or
verified in the current platform.

Remote commands are asynchronous safety-sensitive operations.

Example lifecycle:

```text
REQUESTED
   ↓
QUEUED
   ↓
SENT
   ↓
ACKNOWLEDGED

or

FAILED / EXPIRED
```

A user request is not proof that the physical action happened.

Remote commands require:

- permission;
- capability validation;
- idempotency;
- expiry;
- audit history;
- acknowledgement handling;
- machine-side safety enforcement.

The cloud platform must not bypass controller or physical safety systems.

---

## 15. Development Principles

Implementation should follow these principles:

- strict TypeScript;
- thin controllers;
- backend-owned business rules;
- explicit domain boundaries;
- shared validation where appropriate;
- runtime validation of untrusted data;
- version-controlled migrations;
- UTC timestamp storage;
- localized display;
- explicit currencies;
- permission-based authorization;
- tenant isolation;
- automated tests for critical domain behavior;
- no provider-specific leakage into core business modules.

See:

```text
docs/11-CODING-STANDARDS.md
```

for the complete implementation rules.

---

## 16. Local Development

Use Node.js 24 (24.21.0 is recorded in `.node-version`), pnpm 12.9.1, and Docker
Desktop with Linux containers. Workspace dependencies are pinned in the manifests
and `pnpm-lock.yaml`.

From the repository root:

```sh
pnpm install --frozen-lockfile
```

On a fresh checkout, copy `.env.example` to `.env`. Set a local PostgreSQL password
and update the matching password in `DATABASE_URL`. Do not overwrite an existing
`.env`. Configure real Auth0 values using [the local verification guide](docs/14-AUTH0-LOCAL-VERIFICATION.md),
including the web server's `apps/web/.env.local`. Never copy real credentials into
tests or commit local environment files. The API uses PostgreSQL; queue consumers
remain deferred.

```sh
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm --filter @rental/api dev
```

Keep the API terminal running. In a second terminal at the repository root:

```sh
pnpm --filter @rental/web dev
```

Open [the operational dashboard](http://127.0.0.1:3000/dashboard), using
`127.0.0.1` consistently with Auth0's configured URLs. Both processes are needed:
Next.js serves the UI/session bridge; NestJS enforces business rules and database
authorization. Existing operators do not rerun bootstrap. First-time provisioning
uses the audited flow in the Auth0 guide, never a direct database grant.

`infra:up` starts PostgreSQL 17 with TimescaleDB in one container and Redis in
another, using the shared-cluster option in ADR-010. Published infrastructure
ports bind only to localhost. `pnpm infra:down` stops containers while preserving
their data volumes.

Development endpoints:

| Application | Address                           | Behavior                                                                     |
| ----------- | --------------------------------- | ---------------------------------------------------------------------------- |
| Web         | `http://127.0.0.1:3000/dashboard` | Authenticated EN/TR operational application                                  |
| API         | `http://127.0.0.1:3001/health`    | Process liveness; business API on the same port                              |
| Telemetry   | `http://127.0.0.1:3002/health`    | Optional process liveness; simulator uses the ingestion application directly |
| Worker      | `http://127.0.0.1:3003/health`    | Process liveness; no job consumers                                           |
| Mobile      | `http://localhost:8081`           | Expo development server                                                      |

The backend processes load the root `.env`; their ports and bind address can
be configured there. Health endpoints are liveness checks only and do not claim
database, queue, or provider readiness. Auth0 validates normal application identity;
database Membership/Role/Permission/BranchScope/PlatformAccess governs authorization.
There is no development authentication bypass. The telemetry HTTP process does not
expose production provider ingress; see [the simulator guide](docs/20-TELEMETRY-FOUNDATION.md#api-ui-and-simulator).

`pnpm dev` is an alternative that starts all workspace development tasks after
building their dependencies, including mobile/telemetry/worker and config/i18n watches.
For web-only work, use the two terminals above. API/web source edits reload in dev
mode; shared packages are consumed from `dist`, so rebuild changed shared packages
and restart dependent processes when needed. Refreshing a browser alone cannot
update a stopped server or stale compiled package. Production `start` commands
require a fresh build and process restart.

To inspect the existing Expo foundation separately:

```sh
pnpm --filter @rental/mobile dev
```

The default mobile server binds to localhost for emulator use. To connect a
physical device on a trusted local network, use:

```sh
pnpm --filter @rental/mobile exec expo start --lan
```

Verification and formatting:

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm format:check
pnpm format
```

`build` compiles shared packages and backend services, builds Next.js, and exports
Android and iOS JavaScript/Hermes bundles with Expo. It does not produce signed
APK/AAB/IPA binaries. Native device/simulator validation and distribution builds
are separate steps. `test` builds first (using Turbo's cache) and runs Node's test
runner against compiled service startup, HTTP liveness/routes, invalid environment
configuration, database constraints, tenant isolation, permissions and auditing.
Foundation tests require local PostgreSQL and create/drop a uniquely named test
database; the local account needs CREATEDB. Existing development data is preserved.

The seed upserts the permission catalog without creating users, organizations or
memberships. Additive migrations grant approved new permissions to existing
administration-template roles; onboarding creates tenant roles. EN/TR navigation,
Auth0 and the documented business workflows are implemented.

Playwright needs Chromium (`pnpm exec playwright install chromium`) and creates,
migrates and seeds its own disposable database. It starts/stops its own API/web;
ordinary `pnpm dev` is not required. See [E2E testing](docs/19-E2E-TESTING.md) for
ports, cleanup, personas, artifacts and hosted CI. Never reset the development
database to prepare tests.

On Windows PowerShell, use `pnpm.cmd` instead of `pnpm` if execution policy blocks
the PowerShell shim. No global execution-policy change is needed.

---

## 17. Environments

The platform should support at least:

```text
Local Development
Staging
Production
```

Each environment should have separate configuration and credentials.

Production secrets must never be committed to source control.

Development environments must not casually control production devices.

---

## 18. Testing

Testing should prioritize domain correctness and security.

Important coverage includes:

- tenant isolation;
- permission boundaries;
- rental conflicts;
- rental lifecycle;
- machine replacements;
- partial returns;
- maintenance scheduling;
- service blocks;
- financial formulas;
- telemetry normalization;
- device installation resolution;
- telemetry source resolution;
- financial redaction, VAT, collections and transportation quote history;
- actual browser workflows with isolated personas.

Negative tests are required for sensitive authorization behavior.
Remote-command tests will be required when that domain is explicitly implemented.
The [current verification baseline](docs/19-E2E-TESTING.md#current-verification-baseline)
distinguishes local results, hosted GitHub runs and external verification gates.

---

## 19. Architecture Changes

Major architecture changes require deliberate documentation.

Create or update an ADR when changing areas such as:

- service boundaries;
- database technology;
- telemetry architecture;
- provider abstraction;
- authentication model;
- authorization model;
- machine-device relationship;
- CAN decoding strategy;
- remote-command safety model;
- major infrastructure technology.

Architecture should not drift silently through implementation shortcuts.

---

## 20. Current Project Phase

The core operational web platform is implemented. Navigation and returned data use
effective permissions and tenant/branch scope; PlatformAccess grants no implicit
tenant access. The following guides describe current behavior rather than future scope:

| Area / route                                          | Implementation guide                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account, login and onboarding `/`                     | [Auth0/onboarding](docs/13-AUTHENTICATION-AND-ONBOARDING.md), [real-provider setup](docs/14-AUTH0-LOCAL-VERIFICATION.md)                               |
| Customers `/customers`                                | [Customers](docs/15-CUSTOMER-IMPLEMENTATION.md)                                                                                                        |
| Machines `/machines`                                  | [Machines](docs/16-MACHINE-IMPLEMENTATION.md)                                                                                                          |
| Rentals/reservations/contracts `/rentals`             | [Rental workflow](docs/17-RENTAL-IMPLEMENTATION.md), [transportation quotes](docs/25-RENTAL-TRANSPORTATION.md)                                         |
| Maintenance/plans `/maintenance`                      | [Maintenance](docs/18-MAINTENANCE-IMPLEMENTATION.md)                                                                                                   |
| Devices `/devices`, Machine telemetry                 | [Simulator-backed telemetry](docs/20-TELEMETRY-FOUNDATION.md)                                                                                          |
| Finance analytics `/finance`                          | [ESTIMATE_V1 and Hours/Days](docs/21-FINANCE-ANALYTICS-IMPLEMENTATION.md)                                                                              |
| Payments/collections `/finance/records`               | [VAT and operational finance](docs/24-FINANCE-OPERATIONS-IMPLEMENTATION.md), [ADR-012](docs/decisions/ADR-012-OPERATIONAL-RECEIVABLES-AND-PAYABLES.md) |
| Settings `/settings`                                  | [Organization, roles, branches, invitations and audit](docs/22-TENANT-ADMINISTRATION-IMPLEMENTATION.md)                                                |
| Operational home `/dashboard`, inbox `/notifications` | [Operations and personal notifications](docs/23-OPERATIONS-DASHBOARD-IMPLEMENTATION.md)                                                                |

Rental controls rental state, Maintenance controls service restrictions and canonical
telemetry supplies independent connectivity/fault readings. Transportation quotes
are editable in drafts/quotes, frozen at reservation and retained historically.
Finance shows their VAT-exclusive estimated margin separately from equipment earnings;
supplier costs require their own permissions and unknown costs never become zero.

No new business domain follows automatically. Real telemetry providers/production
ingress, invitation email delivery, mobile feature development, remote commands,
geofencing and statutory accounting remain explicitly deferred. Local/hosted tests
do not establish those external capabilities.
