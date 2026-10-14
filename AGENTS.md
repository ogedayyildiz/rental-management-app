# AGENTS.md

## Purpose

This file provides operational instructions for AI coding agents and developers working in this repository.

It is intentionally concise.

Detailed architecture, domain rules, security requirements, and business rules live in the documents under `docs/`.

When this file conflicts with a more specific approved architecture document or ADR, the more specific document should be followed unless the architecture is deliberately changed and documented.

---

## 1. Project Overview

This project is a multi-tenant SaaS platform for:

- equipment rental management;
- fleet management;
- maintenance;
- machine telemetry;
- GPS tracking;
- CAN-based machine data;
- remote machine actions;
- finance and profitability analytics;
- documents and reporting.

The platform supports:

- web;
- iOS;
- Android.

The initial technical direction is:

```text
TypeScript
pnpm
Turborepo
Next.js
React Native + Expo
NestJS
PostgreSQL
TimescaleDB
Redis
BullMQ
MapLibre
S3-compatible object storage
OIDC
Docker
GitHub Actions
Terraform
```

The core business backend is a modular monolith.

Telemetry ingestion is separately deployable.

---

## 2. Authoritative Documentation

Before implementing a feature, read the document that owns the relevant domain.

```text
docs/01-PROJECT-OVERVIEW.md
docs/02-SYSTEM-ARCHITECTURE.md
docs/03-DOMAIN-MODEL.md
docs/04-UI-UX.md
docs/05-AUTH-AND-PERMISSIONS.md
docs/06-TELEMETRY-IOT.md
docs/07-RENTAL-BUSINESS-RULES.md
docs/08-MAINTENANCE.md
docs/09-FINANCE-ANALYTICS.md
docs/10-SECURITY.md
docs/11-CODING-STANDARDS.md
```

Architecture decisions are stored under:

```text
docs/decisions/
```

Current ADRs include:

```text
ADR-001-MODULAR-MONOLITH.md
ADR-002-PROVIDER-INDEPENDENT-TELEMETRY.md
ADR-003-SEPARATE-TELEMETRY-INGESTION-SERVICE.md
ADR-004-DEVICE-INSTALLATION-HISTORY.md
ADR-005-MULTIPLE-TELEMETRY-SOURCES-PER-MACHINE.md
ADR-006-SERVER-SIDE-CAN-DECODING.md
ADR-007-SEPARATE-MACHINE-STATE-DIMENSIONS.md
ADR-008-PERMISSION-BASED-AUTHORIZATION.md
ADR-009-REMOTE-COMMAND-SAFETY-MODEL.md
ADR-010-POSTGRESQL-TIMESCALEDB.md
```

---

## 3. Read Before Changing

Before modifying:

### Architecture

Read:

```text
docs/02-SYSTEM-ARCHITECTURE.md
docs/11-CODING-STANDARDS.md
relevant ADRs
```

### Domain entities

Read:

```text
docs/03-DOMAIN-MODEL.md
```

### Authentication, roles, or permissions

Read:

```text
docs/05-AUTH-AND-PERMISSIONS.md
docs/10-SECURITY.md
ADR-008-PERMISSION-BASED-AUTHORIZATION.md
```

### Telemetry, GPS, devices, CAN, provider integrations, or remote commands

Read:

```text
docs/06-TELEMETRY-IOT.md
docs/10-SECURITY.md
ADR-002-PROVIDER-INDEPENDENT-TELEMETRY.md
ADR-003-SEPARATE-TELEMETRY-INGESTION-SERVICE.md
ADR-004-DEVICE-INSTALLATION-HISTORY.md
ADR-005-MULTIPLE-TELEMETRY-SOURCES-PER-MACHINE.md
ADR-006-SERVER-SIDE-CAN-DECODING.md
ADR-009-REMOTE-COMMAND-SAFETY-MODEL.md
```

### Rental logic

Read:

```text
docs/07-RENTAL-BUSINESS-RULES.md
```

### Maintenance

Read:

```text
docs/08-MAINTENANCE.md
```

### Finance or analytics

Read:

```text
docs/09-FINANCE-ANALYTICS.md
```

### UI or localization

Read:

```text
docs/04-UI-UX.md
docs/11-CODING-STANDARDS.md
```

---

## 4. Repository Direction

Expected repository structure:

```text
apps/
  web/
  mobile/
  api/
  telemetry/
  worker/

packages/
  domain/
  database/
  validation/
  permissions/
  api-client/
  telemetry/
  i18n/
  config/
  ui/

docs/
  ...
  decisions/

infrastructure/
```

Do not create new top-level applications or services without a clear architectural reason.

---

## 5. Core Architecture Rules

The following rules are mandatory unless deliberately changed through architecture documentation and, where appropriate, an ADR.

1. The core business backend is a modular monolith.
2. Do not introduce microservices merely for code organization.
3. Telemetry ingestion is separately deployable.
4. Web and mobile clients must not access the production database directly.
5. Authoritative business rules belong on the backend.
6. External integrations must remain behind dedicated adapters or integration modules.
7. Core business domains must not depend directly on provider-specific payloads.
8. PostgreSQL is the primary business system of record.
9. TimescaleDB is used for telemetry/time-series workloads.
10. Redis is not an authoritative source of permanent business data.

---

## 6. Tenant Isolation

This is a multi-tenant platform.

Every tenant-owned record must resolve to exactly one organization.

Never assume an entity ID alone is sufficient for tenant-facing access.

Prefer conceptually:

```text
organizationId + entityId
```

over unrestricted entity lookup.

A user from Organization A must never access Organization B data by changing:

```text
URLs
request IDs
machine IDs
rental IDs
document IDs
device IDs
```

Tenant isolation must be enforced on the backend and covered by tests.

---

## 7. Authorization Rules

Authorization is permission-based.

Do not authorize by fixed role name.

Bad:

```ts
if (user.role === "Service Manager") {
```

Preferred conceptually:

```ts
requirePermission("maintenance.complete");
```

Tenant roles are configurable permission collections.

Default roles are templates, not hard-coded business rules.

Platform access and tenant membership are separate concepts.

Platform administrators do not automatically receive unrestricted access to tenant financial or contractual data.

---

## 8. Machine State Rules

Do not collapse machine state into one generic status.

Keep these dimensions separate:

```text
Rental State
Service State
Connectivity State
Operational State
Asset Lifecycle
```

Examples of invalid assumptions:

```text
Offline = Broken
Returned = Available
Stopped = Rental Ended
Fault Cleared = Repaired
```

Availability is derived from relevant domain state and scheduling information.

---

## 9. Device and Machine Rules

A machine and a tracking device are separate entities.

Do not introduce:

```text
machine.device_id
```

as the authoritative relationship.

Use:

```text
DeviceInstallation
```

A machine may have:

```text
zero active devices
one active device
multiple active devices
```

A physical tracking device should normally have no more than one active machine installation at a time.

Historical device assignments must be preserved.

Telemetry must resolve the machine using the installation valid at `recorded_at`.

---

## 10. Telemetry Provider Rules

The platform must remain provider-independent.

Current examples include:

```text
Ruptela
Xtellio
OEM providers
future providers
```

Provider-specific:

```text
payloads
protocols
field names
credentials
device IDs
command formats
```

must remain inside provider integration boundaries.

Core modules should consume normalized platform signals.

Do not write provider-specific business logic throughout the domain.

---

## 11. Ruptela Rules

Ruptela devices communicate with our telemetry infrastructure using Ruptela's proprietary device-to-server protocol.

Do not assume direct Ruptela MQTT is the primary device path.

Ruptela MQTT is not required by the architecture.

If MQTT is introduced later, it may be used as an internal messaging mechanism after normalization or where an explicitly supported provider integration requires it.

Ruptela configured/custom CAN handling and Ruptela protocol parsing are separate concerns.

Conceptually:

```text
Machine CAN
    ↓
Ruptela Device
    ↓
Ruptela Proprietary Protocol
    ↓
Ruptela Adapter
    ↓
Configured CAN Data
    ↓
Machine CAN Decoder
    ↓
Normalized Telemetry
```

Do not assume the tracker automatically streams the complete CAN bus.

---

## 12. CAN Decoder Rules

Provider protocol decoding and machine CAN decoding are separate layers.

Machine-specific CAN interpretation should use versioned decoder profiles where raw/configured CAN is available.

Decoder assignments must preserve history.

Do not silently reinterpret historical telemetry when decoder rules change.

Missing telemetry does not mean zero unless the relevant protocol explicitly defines that behavior.

---

## 13. Multiple Telemetry Sources

A machine may receive the same canonical signal from multiple devices.

Examples:

```text
GPS from Ruptela
GPS from Xtellio

Battery SOC from OEM device
Battery SOC from Ruptela
```

Do not use:

```text
latest received value wins
```

as the universal source-selection rule.

Source resolution may consider:

```text
configured priority
freshness
device health
quality
availability
```

Every normalized telemetry point should preserve source provenance.

Keep:

```text
recorded_at
```

separate from:

```text
received_at
```

Delayed historical telemetry must not incorrectly overwrite newer current state.

---

## 14. Remote Command Rules

Remote commands are safety-sensitive asynchronous operations.

A request is not proof of execution.

Use a command lifecycle such as:

```text
REQUESTED
QUEUED
SENT
ACKNOWLEDGED
FAILED
EXPIRED
```

Remote commands require:

```text
permission
capability check
idempotency
expiry
audit history
failure handling
acknowledgement handling
```

Do not update a machine to `LOCKED` merely because an immobilization request was submitted.

The machine/controller remains responsible for safe physical execution.

Cloud software must not bypass machine safety interlocks.

---

## 15. Rental Rules

A rental may contain multiple rental items and multiple physical machines.

A reservation may be created by:

```text
category
model
quantity
specification
```

before exact physical machines are assigned.

Keep:

```text
RentalItem
```

separate from:

```text
RentalMachineAssignment
```

Machine replacements and partial returns must preserve assignment history.

Historical pricing must remain immutable even when current standard pricing changes.

Telemetry must not automatically start or end a legal rental.

---

## 16. Maintenance Rules

Maintenance history belongs to the machine.

Changing telemetry provider or tracking device must not reset maintenance history.

A telemetry fault disappearing does not mean the machine has been repaired.

Not every due maintenance item automatically blocks rental.

Blocking behavior must follow maintenance severity and explicit service-state rules.

Completed work orders and related technical records form the machine maintenance history.

---

## 17. Finance Rules

The platform provides operational financial and fleet analytics.

It is not initially a complete statutory accounting system.

Do not use JavaScript floating-point arithmetic for authoritative money calculations.

Use appropriate decimal/numeric handling.

Every monetary amount must have an explicit currency.

Centralize formulas for:

```text
ROI
payback
machine contribution
utilization
revenue attribution
maintenance cost per hour
```

Do not independently reimplement these formulas in web, mobile, exports, and reports.

Unauthorized financial fields must not be returned by the backend merely because the frontend hides them.

---

## 18. Time Rules

Store timestamps consistently, preferably in UTC.

Convert for display using the appropriate user or organization timezone.

Keep separate concepts separate.

Examples:

```text
planned_start_at
actual_start_at

recorded_at
received_at

created_at
completed_at
```

Do not store formatted date strings as authoritative timestamps.

---

## 19. Internationalization

All user-facing text must use translation keys.

Do not hard-code UI text in English or Turkish.

Initial languages:

```text
English
Turkish
```

Internal identifiers remain language-independent.

Examples:

```text
ACTIVE
machine.add
finance.profitability.view
```

Changing language must not change monetary values or currency.

---

## 20. Database and Migration Rules

Use version-controlled database migrations.

Do not manually alter production schemas as the normal workflow.

Historical business records should generally be preserved rather than overwritten or deleted.

Use transactions for operations that must succeed or fail together.

Concurrency-sensitive rules must be enforced at the database/backend level where appropriate.

---

## 21. Validation

Treat all external data as untrusted.

Validate:

```text
HTTP requests
mobile requests
telemetry packets
provider responses
webhooks
imports
environment configuration
file metadata
```

Use Zod or the approved project validation mechanism where appropriate.

TypeScript types are not runtime validation.

---

## 22. Security Rules

Never commit secrets.

Never send provider or infrastructure credentials to frontend applications.

Databases must not be publicly exposed.

Uploaded files are untrusted.

Sensitive exports must apply the same authorization rules as normal APIs.

Do not log:

```text
passwords
access tokens
refresh tokens
provider secrets
private keys
authentication headers
```

Unknown telemetry devices must not automatically become trusted machines or tenant resources.

---

## 23. Testing Requirements

Important domain behavior requires automated tests.

At minimum, cover relevant:

```text
tenant isolation
permissions
rental conflicts
rental transitions
machine replacements
partial returns
maintenance rules
financial formulas
telemetry normalization
device installation resolution
signal-source resolution
remote command transitions
```

Negative authorization tests are mandatory for sensitive features.

Example:

```text
Organization A user cannot read Organization B machine.
```

---

## 24. Code Quality Rules

Use strict TypeScript.

Avoid `any` in domain and application code.

Prefer `unknown` for untrusted input before validation.

Keep controllers thin.

Keep business logic out of React components.

Avoid circular module dependencies.

Do not introduce abstractions without a concrete need.

Do not create generic frameworks for a single simple use case.

Comments should explain why unusual behavior exists rather than restating obvious code.

---

## 25. Architecture Changes and ADRs

Do not silently change an established architecture decision because another implementation looks easier.

Create or update an ADR when changing a major decision involving:

```text
application boundaries
service boundaries
database technology
telemetry architecture
provider abstraction
authentication architecture
authorization model
device-machine relationship
remote-command model
CAN decoding strategy
major infrastructure technology
```

Minor implementation choices do not require ADRs.

When an approved architecture decision changes:

1. update or supersede the relevant ADR;
2. update affected architecture/domain documents;
3. update this file if the operational rule changes.

---

## 26. AI Agent Working Rules

Before writing code:

1. identify the domain being changed;
2. read the relevant documentation;
3. inspect existing implementation patterns;
4. preserve established terminology and boundaries;
5. make the smallest coherent change;
6. add or update tests;
7. update documentation when behavior or architecture changes.

Do not invent missing business rules silently.

If documentation is ambiguous or contradictory:

1. identify the conflict;
2. prefer the more specific and newer accepted ADR where applicable;
3. ask for clarification if the decision materially affects behavior;
4. do not hide the ambiguity through an arbitrary implementation choice.

Do not refactor unrelated areas merely because they could be improved.

Do not replace an established dependency, architecture pattern, or domain model without a documented reason.

---

## 27. Definition of Done

A change is not complete merely because it compiles.

Where applicable, it should satisfy:

```text
implementation complete
types pass
validation added
permissions enforced
tenant scope enforced
tests added or updated
migrations added
audit behavior considered
i18n added
error handling added
security impact reviewed
documentation updated
relevant ADR updated if architecture changed
```

The implementation must remain consistent with the documented domain model and architecture.
