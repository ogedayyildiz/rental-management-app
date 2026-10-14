# Coding Standards

**Document:** `11-CODING-STANDARDS.md`  
**Status:** Initial Architecture Definition  
**Scope:** TypeScript standards, repository structure, module boundaries, APIs, validation, database access, tenancy, permissions, telemetry integrations, financial precision, time handling, i18n, testing, logging, security, and implementation quality.

---

## 1. Purpose

This document defines the implementation standards for the platform.

Its purpose is to ensure that developers and AI coding agents implement features consistently with the architecture and business rules defined elsewhere in the project documentation.

The goal is not stylistic perfection.

The goal is to prevent architectural drift, inconsistent business logic, security problems, provider coupling, duplicated calculations, and code that becomes difficult to maintain.

Before implementing a feature, the relevant domain documentation should be consulted.

Important architectural decisions must not be silently changed simply because another implementation appears easier.

---

## 2. Primary Technology Standards

The primary language is:

```text
TypeScript
```

The intended application stack is:
```

Web:
Next.js + React

Mobile:
React Native + Expo

Backend API:
NestJS

Telemetry:
TypeScript-based separately deployable telemetry service

Validation:
Zod

Database:
PostgreSQL

Time-Series:
TimescaleDB

Queue / Cache:
Redis + BullMQ

Repository:
pnpm + Turborepo

UI:
Tailwind CSS + shadcn/ui where applicable

Charts:
ECharts
```

The project should prefer one language and shared TypeScript types where practical.
Introducing another programming language requires a clear technical reason.

# 3. Repository Structure
The repository should remain a monorepo.
Conceptually:
```
apps/
  web/
  mobile/
  api/
  telemetry/
  worker/

packages/
  shared/
  domain/
  validation/
  api-client/
  ui/
  config/
```

The exact package structure may evolve, but responsibilities must remain clear.

Shared packages must not become uncontrolled dumping grounds.

Code belongs in a shared package only when multiple applications genuinely need it.

# 4. Modular Architecture
The core business backend should begin as a modular monolith.

Business modules may include:

- organizations
- users
- customers
- machines
- rentals
- maintenance
- finance
- documents
- notifications
- audit

Modules should have explicit boundaries and controlled public interfaces.
Do not create a separate network service merely because a domain has its own module.

A module should become an independently deployed service only when there is a demonstrated reason such as:
```
Independent scaling requirement

Different availability requirement

Independent deployment requirement

Security isolation

Different technology requirement

Significant team ownership boundary

Telemetry ingestion is intentionally separately deployable because its workload and connection model differ significantly from normal business API traffic.
```
# 5. Dependency Direction
Business logic should not depend directly on:

React components

HTTP controllers

Provider-specific APIs

Database row structures

Ruptela packet formats

Xtellio payloads
```
Preferred direction:
Transport / Infrastructure
        ↓
Application Services
        ↓
Domain Logic
```

Provider and infrastructure code may depend on domain contracts.
Domain logic must not depend on provider implementations.
Avoid circular module dependencies.

If two modules repeatedly require each other's internal implementation, reconsider the boundary.
# 6. TypeScript Rules
TypeScript should run in strict mode.
Avoid:
any

unless absolutely necessary at a tightly controlled external boundary.
Prefer:
unknown

for untrusted external values until validation occurs.
Functions, domain objects, API contracts, and important return types should have explicit meaningful types.
Do not create broad types such as:
```Typescript
Record<string, any>
```
for core business data.
Prefer narrow domain-specific types.
Use discriminated unions where they make state handling safer.
Example:
``` javascript
type CommandResult =
  | { status: "ACKNOWLEDGED"; acknowledgedAt: Date }
  | { status: "FAILED"; reason: string }
  | { status: "EXPIRED" };
```
Avoid unsafe type assertions merely to silence the compiler.
# 7. Naming and Domain Terminology
Code should use the terminology defined in the domain documentation.
Examples:
```
Machine
TrackingDevice
DeviceInstallation
Rental
RentalItem
RentalMachineAssignment
MaintenancePlan
MachineMaintenancePlan
WorkOrder
FaultEvent
DeviceCommand
```

Do not invent alternative names for existing concepts without a deliberate domain change.
For example, do not interchange:

- Machine
- Asset
- Equipment
- Vehicle
- Unit

randomly inside the same domain.

Internal names should generally be English and language-independent.

Use descriptive names rather than abbreviations unless the abbreviation is an established technical standard such as:

- CAN
- GPS
- IMEI
- API
- OIDC

# 8. Stable Identifiers and Status Values
Business entities should normally use immutable internal identifiers such as UUIDs.
Human-readable identifiers such as:
- R-2026-000042
- WO-2026-000184

are separate from database identity.

Canonical statuses should use stable language-independent values.
Example:
```
DRAFT
RESERVED
ACTIVE
COMPLETED
CANCELLED
```

Do not store translated status text in the database.
Do not use display labels as business logic.

Bad:
```Typescript
if (rental.status === "Kirada") {
```
Correct conceptually:
```Typescript
if (rental.status === "ACTIVE") {
```
# 9. Validation
All data entering a trust boundary must be validated.

Examples:
```
HTTP requests
Mobile requests
Telemetry packets
Provider API responses
Webhook payloads
File imports
Environment configuration
External integration data
```

- Use Zod or the project's approved validation mechanism for structured application data.

- Validation and TypeScript typing are different responsibilities.

- TypeScript provides compile-time safety.

- Validation protects runtime boundaries.

Never assume external data is valid merely because a TypeScript interface describes it.

# 10. API Design

The backend API is authoritative for business operations.
Web and mobile applications should communicate through defined backend APIs rather than directly accessing databases or providers.
Controllers should remain thin.

Conceptually:
```
Controller
    ↓
Application Service / Use Case
    ↓
Domain Logic
    ↓
Repository / Infrastructure
```

Do not implement important business rules inside HTTP controllers.

API operations should use consistent:
- Request validation
- Authentication
- Authorization
- Tenant resolution
- Error responses
- Audit behavior

Important mutation endpoints should support idempotency where duplicate requests could create harmful duplicate actions.

# 11. Tenant Scoping
Tenant isolation is mandatory.

Tenant-owned data must never be retrieved solely by entity ID without organization scope unless the repository abstraction guarantees tenant isolation another way.
Conceptually prefer:
```Java
findMachine({
  organizationId,
  machineId
})
```

over unrestricted:
```Java
findMachine(machineId)
```
for tenant-facing operations.


Never trust an organization_id supplied by the frontend without verifying the user's active membership and access.

Cross-tenant access must fail closed.

Tenant-scoping rules must be tested.

# 12. Permissions and Authorization
Authorization checks must use permissions, not role names.
Bad:
```Java
if (user.role === "Service Manager") {
```
Preferred:
```Java
requirePermission("maintenance.complete");
```

Tenant roles are configurable.

A role named:
- Operations Manager

may have the same capabilities another company assigns to:
- Service Manager

Platform-level access and tenant-level permissions must remain separate.
Frontend permission checks improve UX but do not replace backend authorization.

# 13. Database Access and Transactions
Database access should occur through controlled repositories or data-access components rather than ad hoc SQL scattered throughout application code.

Business operations requiring consistency should use database transactions.

Examples include:
```
Machine assignment
Rental start
Rental return
Machine replacement
Work-order completion
Financial entry creation
Device installation changes
```

Concurrency-sensitive operations must be protected at the database level where appropriate.
Frontend conflict checks are insufficient.
Avoid storing the same authoritative fact independently in several tables unless there is an explicit synchronization strategy.

# 14. Database Migrations and Historical Data
All production schema changes must use version-controlled database migrations.
Do not manually modify production database schemas as the normal deployment process.
Migrations should preserve existing data wherever possible.
Destructive changes require explicit consideration.
Historical business records must not be rewritten merely to simplify a new schema.
Examples include:
Rental history
Machine assignments
Maintenance history
Financial history
Device installation history
Fault history
Audit events

Backfills should be deterministic and reviewable.
# 15. Money, Currency, and Financial Calculations
Never use JavaScript floating-point arithmetic as the authoritative representation for money.
Use:
PostgreSQL numeric

Decimal arithmetic

or integer minor units where appropriate

Every monetary value must have an explicit currency.
Bad:
```Java
price = 25000;
```
Preferred conceptually:
```TypeScript
{
  amount: Decimal("25000.00"),
  currency: "TRY"
}
```

Financial formulas such as:
- ROI
- Payback
- Machine Contribution
- Utilization
- Revenue Attribution
- Maintenance Cost per Hour

must be defined centrally.
Do not duplicate financial formulas independently across:

- Web
- Mobile
- API
- Reports
- Exports

The backend or shared analytics layer should be authoritative.

# 16. Dates, Times, and Historical Ordering
Persist timestamps consistently, preferably in UTC.
Display them using the relevant user or organization timezone.
Do not store formatted date strings as authoritative timestamps.
Keep different time concepts separate.
Examples:
```
planned_start_at
actual_start_at

recorded_at
received_at

created_at
completed_at

For telemetry:
recorded_at

represents when the device observed the data.
received_at

represents when our platform received it.
```

Delayed historical telemetry must not incorrectly overwrite newer current state.
# 17. Localization and User-Facing Text
All user-facing text must use the localization system.

Do not hard-code English or Turkish strings inside UI components.

Bad:
```html
<Button>Add Machine</Button>
```

Preferred conceptually:
```html
<Button>{t("machine.add")}</Button>
```
This includes:
- Navigation
- Pages
- Buttons
- Labels
- Statuses
- Errors
- Warnings
- Notifications
- Dialogs
- Reports

Initial application languages are:
- English
- Turkish

Internal identifiers, permission names, database statuses, and API values remain language-independent.
Changing UI language must not modify currency or underlying business data.
# 18. Telemetry Provider Integrations
Provider-specific implementations must remain behind provider adapters.
Examples:
```
RuptelaAdapter
XtellioAdapter
FutureProviderAdapter
```

Core business modules must not contain logic such as:
```java
if (provider === "RUPTELA") {
```
unless the code is inside the provider integration boundary or capability-resolution infrastructure.
Provider structures must be converted into normalized platform telemetry.
Conceptually:
```
Provider Data
     ↓
Provider Adapter
     ↓
Normalized Telemetry
     ↓
Business Modules
```
Ruptela protocol parsing and machine-specific CAN decoding are separate responsibilities.
```
Do not mix:
Ruptela transport protocol decoding

with:
Machine CAN signal interpretation
```

Machine-specific CAN decoding should use versioned decoder profiles.
# 19. Machines, Devices, and Telemetry Sources
A machine and a tracking device are separate entities.

Do not add a permanent field such as:

- machine.device_id

as the authoritative relationship.
Use:
- DeviceInstallation

to preserve installation history.
A machine may have:
- Zero active devices
- One active device
- Multiple active devices

A physical device should normally belong to no more than one active machine installation at the same time.
Provider changes must preserve telemetry and installation history.
If multiple devices provide the same normalized signal, do not automatically use:
latest received value wins

The telemetry source resolver must consider configured source priority, freshness, quality, availability, and device health.
# 20. Remote Commands and Safety-Critical Code
Remote machine commands require stricter implementation discipline than normal CRUD operations.
A command request is not equivalent to successful physical execution.
The lifecycle must preserve concepts such as:
```
REQUESTED
QUEUED
SENT
ACKNOWLEDGED
FAILED
EXPIRED

Do not update machine state to:
LOCKED
```
simply because an immobilization request was submitted.
Command implementations must consider:
Permission
Capability
Idempotency
Expiry
Provider acknowledgement
Audit history
Failure handling

Safety-critical physical behavior must remain enforced by machine/controller hardware and software.
Cloud code must not assume it can safely interrupt machine power at arbitrary times.
# 21. Error Handling, Logging, and Observability
Expected business errors should be represented explicitly.
Examples:
```
Machine unavailable
Rental conflict
Permission denied
Maintenance block active
Device command unsupported
Command expired
Unknown tracking device
```
Avoid throwing generic errors with no meaningful classification.
Do not expose internal stack traces or secrets to end users.
Use structured logging.
Include useful correlation information such as:
request_id
organization_id
user_id
machine_id
provider
command_id

where appropriate and permitted.
Never intentionally log:
Passwords
Access Tokens
Refresh Tokens
Provider Secrets
Authentication Headers
Private Keys

Use Sentry and OpenTelemetry according to the system architecture.
# 22. Testing Standards
Important business rules require automated tests.
At minimum, testing should cover:
Tenant Isolation
Permission Enforcement
Rental Conflicts
Rental State Transitions
Machine Replacement
Partial Returns
Maintenance Due Calculations
Technical Service Blocks
Financial Calculations
Currency Rules
Telemetry Normalization
Device Installation Resolution
Signal Source Resolution
Remote Command State Transitions

Prefer unit tests for pure business rules and integration tests for database, API, authorization, and provider-boundary behavior.
Critical security and tenant-isolation tests should not be omitted merely because a feature works manually.
Tests should verify negative cases as well as successful cases.
Example:
User from Organization A cannot access Machine from Organization B.

is as important as:
Authorized user can access Machine from Organization A.

# 23. Code Quality, Dependencies, and Documentation
Prefer simple, readable implementations over unnecessary abstraction.
Do not create generic frameworks for problems that currently have one straightforward implementation.
Avoid premature optimization and premature microservice extraction.
Before adding a dependency, consider:
Is it maintained?

Is it necessary?

Does the platform already provide this functionality?

Does it significantly increase bundle or runtime complexity?

Does it introduce security or licensing concerns?

Comments should explain:
Why

rather than restating obvious code.
Important domain assumptions should be documented in project documentation or ADRs rather than hidden only inside comments.
Public module interfaces and unusual business rules should be understandable without reverse-engineering the implementation.
Generated code must be clearly distinguishable from hand-maintained business logic and should not be manually modified if regeneration would overwrite those changes.
# 24. Fundamental Coding Rules
The following rules are mandatory unless intentionally changed through an architectural decision:
1. Use TypeScript as the primary application language.
2. Keep TypeScript strict.
3. Avoid any in domain and application code.
4. Validate all external input.
5. Keep controllers thin.
6. Keep business rules out of React components.
7. Maintain clear module boundaries.
8. Do not introduce unnecessary microservices.
9. Telemetry ingestion remains separately deployable from the main business API.
10. Core business logic must not depend on Ruptela, Xtellio, or another provider.
11. Provider-specific data stops at the provider adapter boundary.
12. Machine CAN decoding and provider protocol decoding are separate concerns.
13. Machine and TrackingDevice are separate entities.
14. Use DeviceInstallation to associate devices and machines over time.
15. Do not assume one machine has only one telemetry device.
16. Do not use role names for authorization.
17. Enforce permissions on the backend.
18. Enforce organization scope on tenant data.
19. Do not send unauthorized financial data and rely on frontend hiding.
20. Do not use JavaScript floating-point numbers for authoritative money calculations.
21. Store explicit currency with monetary values.
22. Centralize financial and analytics formulas.
23. Preserve historical business records.
24. Use version-controlled database migrations.
25. Keep planned and actual timestamps separate.
26. Preserve recorded_at separately from received_at for telemetry.
27. Do not allow delayed telemetry to overwrite newer current state incorrectly.
28. Do not hard-code user-facing language.
29. Use stable internal status identifiers.
30. Telemetry does not automatically change rental state.
31. Fault disappearance does not automatically complete maintenance.
32. A remote command request is not proof of physical execution.
33. Safety-critical commands require acknowledgement, expiry, auditability, and idempotency.
34. Database and infrastructure services must not be accessed directly from frontend applications.
35. Important domain logic must have automated tests.
36. Tenant isolation and permission boundaries must have explicit tests.
37. Avoid silent architectural redesign during feature implementation.
38. When implementation requirements conflict with the documented architecture, update the architecture deliberately rather than working around it invisibly.
Related Documents
This document should be read together with:
01-PROJECT-OVERVIEW.md
02-SYSTEM-ARCHITECTURE.md
03-DOMAIN-MODEL.md
04-UI-UX.md
05-AUTH-AND-PERMISSIONS.md
06-TELEMETRY-IOT.md
07-RENTAL-BUSINESS-RULES.md
08-MAINTENANCE.md
09-FINANCE-ANALYTICS.md
10-SECURITY.md

Responsibility boundaries:
CODING-STANDARDS
→ how the architecture should be implemented consistently

SYSTEM-ARCHITECTURE
→ overall technical structure and technology decisions

DOMAIN-MODEL
→ business entities and relationships

AUTH-AND-PERMISSIONS
→ identity and authorization rules

SECURITY
→ trust boundaries and protection requirements

DOMAIN DOCUMENTS
→ business rules that implementation must preserve

ADRs
→ why important architectural decisions were made