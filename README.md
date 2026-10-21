# Rental Management and Equipment Tracking Platform

Multi-tenant SaaS platform for equipment rental management, fleet operations, maintenance, telemetry, GPS tracking, CAN-based machine data, remote machine actions, financial analytics, documents, and reporting.

> **Project status:** Customer and Machine management implemented.
>
> Real Auth0 web authentication, platform bootstrap, two-user tenant onboarding and Customer management are manually verified. Machines are manually verified. Rental/reservation/contract management adds tenant/branch-scoped workflows and an English/Turkish interface at `/rentals`; see [implementation and smoke-test guide](docs/17-RENTAL-IMPLEMENTATION.md). Other product domains remain deferred; real mobile login verification remains separate.

See [Machine implementation and smoke test](docs/16-MACHINE-IMPLEMENTATION.md) for state dimensions, branch scope, specifications and acquisition-cost permissions.

See [Customer implementation contracts](docs/15-CUSTOMER-IMPLEMENTATION.md) for permissions, identifiers, addresses, pagination, audit behavior and development-data notes.

See [authentication and onboarding setup](docs/13-AUTHENTICATION-AND-ONBOARDING.md)
for required environment values, Auth0 dashboard steps, callback URLs and current
verification limits. This supersedes authentication/onboarding deferrals in the
original bootstrap instructions below. The API and web server now require Auth0
configuration at startup; no development authentication bypass exists.

For first-time Auth0 setup, follow the [local verification checklist](docs/14-AUTH0-LOCAL-VERIFICATION.md),
including the audited one-time platform operator command and two-user browser/mobile checks.

---

## 1. Product Scope

The platform is designed for rental companies managing construction equipment, access equipment, forklifts, telehandlers, and other serialized machinery.

Primary capabilities include:

- organization and branch management;
- user memberships, roles, and permissions;
- customer management;
- machine and fleet management;
- reservations and rentals;
- machine assignment and replacement history;
- maintenance planning and work orders;
- faults and inspections;
- telemetry and GPS tracking;
- custom CAN data decoding;
- remote machine commands;
- profitability, ROI, payback, and utilization analytics;
- documents and reports;
- notifications;
- audit history;
- future AI-assisted technical support.

The product will support:

- Web;
- iOS;
- Android.

Initial user-facing languages:

- English;
- Turkish.

---

## 2. Architecture Summary

The platform uses a TypeScript monorepo.

Core stack:

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
OpenID Connect

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

Expected repository structure:

```text
rental-platform/
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
│       └── ADR-010-POSTGRESQL-TIMESCALEDB.md
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

The exact package structure may evolve during implementation, but the documented module and dependency boundaries should be preserved.

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

The platform provides management analytics rather than replacing a full accounting system.

Key metrics include:

- attributed rental revenue;
- acquisition cost;
- maintenance cost;
- machine contribution;
- ROI;
- payback;
- commercial utilization;
- physical utilization;
- downtime;
- revenue per operating hour;
- maintenance cost per operating hour;
- resale and lifecycle analysis.

Monetary values require explicit currency and decimal-safe handling.

Financial calculations must be centralized.

---

## 14. Remote Machine Commands

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
`.env`. The API uses PostgreSQL; queue integration remains deferred.

```sh
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`infra:up` starts PostgreSQL 17 with TimescaleDB in one container and Redis in
another, using the shared-cluster option in ADR-010. Published infrastructure
ports bind only to localhost. `pnpm infra:down` stops containers while preserving
their data volumes.

Development endpoints:

| Application | Address                        | Behavior                                |
| ----------- | ------------------------------ | --------------------------------------- |
| Web         | `http://127.0.0.1:3000`        | Localized bootstrap screen              |
| API         | `http://127.0.0.1:3001/health` | Process liveness                        |
| Telemetry   | `http://127.0.0.1:3002/health` | Process liveness; no ingestion listener |
| Worker      | `http://127.0.0.1:3003/health` | Process liveness; no job consumers      |
| Mobile      | `http://localhost:8081`        | Expo development server                 |

The three backend shells load the root `.env`; their ports and bind address can
be configured there. Health endpoints are liveness checks only and do not claim
database, queue, or provider readiness. Protected branch endpoints exist but the
default authentication verifier rejects all credentials until a verified identity
adapter is supplied. There is no development authentication bypass.

`pnpm dev` builds shared dependencies first and watches the configuration and
translation packages. To use Expo's interactive shortcuts, run mobile separately:

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

Prisma schema/migrations, shared validation and permission definitions now support
the API foundation. The seed inserts essential permissions only, without users,
organizations or roles. The initial screens use English; language selection,
BullMQ jobs, OIDC integration, onboarding and business workflows remain deferred.
See [foundation implementation notes](docs/12-FOUNDATION-IMPLEMENTATION.md) for
schema details, trust boundaries, verification and scoped implementation choices.

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
- remote-command transitions.

Negative tests are required for sensitive authorization behavior.

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

The current sequence is:

```text
Architecture and Product Documentation
        ↓
Architecture Decision Records
        ↓
AGENTS.md
        ↓
README.md
        ↓
Repository Bootstrap
        ↓
Core Infrastructure
        ↓
Domain Implementation
        ↓
Web / Mobile Implementation
        ↓
Telemetry Integration
        ↓
Testing and Deployment
```

The database/migration, tenant-context, permission and audit foundation is in place.
Auth0, invitation/administration, Customers and Machines are implemented.
Rental workflows are documented in `docs/17-RENTAL-IMPLEMENTATION.md`.
