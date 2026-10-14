# 02 - System Architecture

## Document Status

Status: Draft  
Version: 0.2  
Project: Rental Management and Equipment Tracking Platform

---

# 1. Purpose of This Document

This document defines the technical architecture of the Rental Management and Equipment Tracking Platform.

It describes:

- The main software applications and services.
- How the web and mobile applications communicate with the backend.
- How machine telemetry enters the system.
- How business data and telemetry data are stored.
- Which major technologies are used.
- How modules are separated.
- How external providers are integrated.
- How the system should be deployed.
- How the architecture can grow over time.

This document describes HOW the system is structured.

Detailed business entities and database relationships are defined in:

`03-DOMAIN-MODEL.md`

Detailed UI behavior is defined in:

`04-UI-UX.md`

Detailed authorization rules are defined in:

`05-AUTH-AND-PERMISSIONS.md`

Detailed telemetry rules are defined in:

`06-TELEMETRY-IOT.md`

---

# 2. Architectural Goals

The system architecture must support the following goals.

## 2.1 Maintainability

The project is expected to grow considerably over time.

The architecture must therefore make it clear:

- Where new code belongs.
- Which module owns each business concept.
- Which modules are allowed to communicate.
- Which types can be shared.
- Which external services are being used.
- Which implementation details must remain isolated.

Codex and human developers should be able to modify one area without unnecessarily affecting unrelated areas.

---

## 2.2 SaaS Multi-Tenancy

The application will serve multiple rental companies.

All tenant-owned business data must be isolated by organization.

The architecture must support:

- Multiple organizations.
- Multiple branches per organization.
- Multiple users per organization.
- Organization-specific settings.
- Organization-specific permissions.
- Organization-specific machines.
- Organization-specific customers.
- Organization-specific financial information.

Tenant isolation is a fundamental architectural requirement.

---

## 2.3 Web and Mobile Support

The product must support:

- Web browsers.
- iOS.
- Android.

Web and mobile applications must use the same backend services and business rules.

Business logic must not be duplicated independently in the web and mobile applications.

---

## 2.4 Internationalization

The architecture must support:

- Multiple languages.
- Multiple currencies.
- Multiple time zones.
- Regional date and number formats.

Internationalization must be considered from the beginning rather than added later.

---

## 2.5 Telemetry Integration

The platform must support equipment tracking devices and machine telemetry.

Telemetry requirements differ significantly from normal rental-management traffic.

The architecture must therefore separate normal application operations from high-volume telemetry ingestion.

---

## 2.6 Provider Independence

The system must not become permanently dependent on one:

- GPS provider.
- Map provider.
- Email provider.
- Cloud provider.
- Object storage provider.
- Authentication provider.

External services must be accessed through well-defined interfaces or adapters where practical.

---

## 2.7 Security

The architecture must support:

- Secure authentication.
- Permission-based authorization.
- Tenant isolation.
- Audit logging.
- Secure device communication.
- Secure handling of secrets.
- Protected financial information.
- Protected remote machine commands.

---

## 2.8 Modular Architecture and Future Service Separation

The core business backend will initially use a:

**Modular Monolith**

rather than a large microservice architecture.

The goal is not to avoid microservices permanently. The goal is to preserve strong domain boundaries and the ability to extract services later without paying distributed-system complexity before it is justified.

Core domains such as rentals, machines, customers, maintenance, finance, documents, notifications, and audit often participate in the same transactional workflows. Keeping them inside one deployable business backend initially allows normal database transactions, simpler debugging, easier local development, and faster domain evolution.

Each module must nevertheless have:

- Clear ownership.
- Explicit interfaces.
- Controlled dependencies.
- Minimal knowledge of other modules' internals.
- Business rules located in the module that owns the concept.

A module may later become an independent service when there is a demonstrated reason such as:

- Independent scaling.
- Independent deployment frequency.
- Different availability requirements.
- Security isolation.
- Different technology requirements.
- Stable team ownership boundaries.

Telemetry ingestion is the deliberate exception from the beginning because its machine-driven traffic, protocol handling, connection model, and time-series workload differ significantly from normal application API traffic.

This decision is documented in:

`docs/decisions/ADR-001-MODULAR-MONOLITH.md`

# 3. High-Level System Architecture

The platform contains five primary deployable application components:

1. Web Application.
2. Mobile Application.
3. Backend API.
4. Telemetry Ingestion Service.
5. Background Worker.

The telemetry architecture is provider-independent. Different providers may reach the telemetry service through different transports.

The initial high-level architecture is:

```text
                              USERS
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
                 ▼                             ▼

          WEB APPLICATION               MOBILE APPLICATION
             Next.js                 React Native + Expo
                 │                             │
                 └──────────────┬──────────────┘
                                │ HTTPS
                                ▼

                        ┌─────────────────┐
                        │   BACKEND API   │
                        │     NestJS      │
                        └────────┬────────┘
                                 │
                 ┌───────────────┼────────────────┐
                 │               │                │
                 ▼               ▼                ▼
            PostgreSQL         Redis        Object Storage
          + TimescaleDB                     S3 Compatible


       MACHINE / TELEMATICS PROVIDERS
                 │
        ┌────────┴───────────────┐
        │                        │
        ▼                        ▼
 Ruptela Device             Xtellio Cloud
 Proprietary Protocol       API / Streaming
        │                        │
        └────────────┬───────────┘
                     ▼
           ┌──────────────────────┐
           │ TELEMETRY INGESTION  │
           │       SERVICE        │
           └──────────┬───────────┘
                      │
              Provider Adapters
                      │
             Machine CAN Decoder
              where required
                      │
                      ▼
             Normalized Telemetry
                      │
          ┌───────────┼────────────┐
          ▼           ▼            ▼
     TimescaleDB  Current State  Domain Events
```

Ruptela does not require MQTT in the device-to-server path. Ruptela devices connect to our public telemetry endpoint using Ruptela's proprietary protocol.

Xtellio is treated as a separate provider integration boundary, typically through its cloud/API or streaming interfaces. Exact Xtellio payload, authentication, and streaming details must follow the official provider documentation and enabled service capabilities.

MQTT may be introduced later as an internal messaging mechanism if it provides a concrete benefit, but it is not a required transport for the initial architecture.

# 4. Technology Stack
The initial technology stack will use TypeScript wherever practical.
## 4.1 Primary Language
Primary application language:
TypeScript
TypeScript will be used for:
- Backend API.
- Web application.
- Mobile application.
- Shared domain types.
- Validation.
- API clients.
- Background workers.
- Telemetry processing.
Using one language across the majority of the platform reduces duplication and makes the system easier to maintain.

---

#5. Repository Architecture
The application will use a monorepo.
Recommended tooling:
- pnpm.
- Turborepo.
The initial repository structure should resemble:
rental-platform/
```text
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
---

# 6. Web Application
The web application will use:
- Next.js.
- React.
- TypeScript.
- Tailwind CSS.
- shadcn/ui.
The web application is primarily intended for desktop and tablet management workflows.
Typical functionality includes:
- Dashboard.
- Machine management.
- Customer management.
- Rental management.
- Map.
- Maintenance.
- Financial analytics.
- Reporting.
- User management.
- Organization settings.
- Device management.
The web application must communicate with the backend through the defined API.
The web application must not directly access the production database.
# 7. Mobile Application
The mobile application will use:
- React Native.
- Expo.
- TypeScript.
A single mobile codebase will support:
- iOS.
- Android.
The mobile application is primarily intended for:
- Service technicians.
- Fleet managers.
- Managers.
- Field personnel.
Important mobile capabilities may include:
- Machine search.
- Machine status.
- Machine location.
- Maintenance workflows.
- Fault information.
- QR-code scanning.
- Camera/photo upload.
- Push notifications.
- Remote actions for authorized users.
The mobile application must use the same backend API and authorization rules as the web application.

# 8. Backend API
The backend API will use:
- Node.js.
- TypeScript.
- NestJS.
The backend API is the primary owner of business logic.
The frontend applications must not contain authoritative business rules that could be bypassed by directly calling an API.
For example:

Incorrect architecture:
```
Web UI
   ↓
"User seems to have permission"
   ↓
Database update
```

Correct architecture:
```
Web UI
   ↓
Backend API
   ↓
Authentication
   ↓
Permission check
   ↓
Business rule validation
   ↓
Database operation
```

# 9. Backend Architectural Style
The initial backend will use a:
Modular Monolith

The backend is deployed as one primary application but internally divided into clear domain modules.
Possible modules include:
- AuthModule

- OrganizationModule

- UserModule

- PermissionModule

- BranchModule

- CustomerModule

- MachineModule

- DeviceModule

- RentalModule

- MaintenanceModule

- FaultModule

- FinanceModule

- TelemetryModule

- NotificationModule

- DocumentModule

- ReportModule

- AuditModule

Each module should own its business rules.
Modules should communicate through explicit services and interfaces rather than directly manipulating each other's database tables wherever practical.

---

# 10. Why a Modular Monolith
The project should not initially create separate microservices for:
- Users.
- Machines.
- Rentals.
- Maintenance.
- Finance.
- Customers.

Doing so would introduce unnecessary complexity involving:

- Network communication.
- Distributed transactions.
- Service discovery.
- Multiple deployments.
- Multiple logging systems.
- Multiple authentication boundaries.
- Increased development complexity.
The modular monolith provides strong separation while remaining easy to develop and operate.
Modules may later be separated into independent services if justified by:
- Scale.
- Security.
- Reliability.
- Team ownership.
- Deployment requirements.

Telemetry ingestion is already treated separately because its workload is fundamentally different.

# 11. API Architecture
The initial application API will primarily use:
REST
Example endpoints may resemble:
```
GET    /machines
POST   /machines

GET    /machines/:id
PATCH  /machines/:id

GET    /machines/:id/telemetry
GET    /machines/:id/faults
GET    /machines/:id/maintenance

GET    /customers
POST   /customers

GET    /rentals
POST   /rentals

GET    /dashboard
```
Exact endpoints will be defined during implementation.

GraphQL is not required for the initial platform.

# 12. API Versioning
The external API should support versioning when necessary.
Example:
```
/api/v1/
```

Breaking API changes should not be introduced silently.

Internal application code may evolve more rapidly, but externally consumed APIs should remain stable.

# 13. API Validation
All incoming API data must be validated.

Recommended validation library: Zod

Shared validation schemas should be stored in reusable packages where appropriate.
Example:
```
packages/validation
```
Frontend validation may improve user experience, but backend validation remains mandatory.
Frontend validation must never be considered a security boundary.
# 14. Shared Domain Types
Important domain types must not be independently re-created in:
- Web.
- Mobile.
- Backend.
Shared definitions should exist where appropriate.
For example:
```
packages/domain
```
may contain concepts such as:

- MachineStatus

- RentalStatus

- FaultSeverity

- Currency

- MachineCategory

- Permission

Care must be taken not to expose backend-only internal models unnecessarily to frontend applications.

---

# 15. Database
The primary relational database will be: PostgreSQL

PostgreSQL will be the system of record for business data.

Typical data includes:
- Organizations.
- Users.
- Memberships.
- Permissions.
- Branches.
- Customers.
- Machines.
- Tracking devices.
- Rentals.
- Maintenance.
- Financial records.
- Documents.
- Audit logs.
- Notifications.

The detailed database design will be defined in 03-DOMAIN-MODEL.md.

---

# 16. ORM / Database Access
An ORM or strongly typed SQL abstraction should be used.
Initial recommended choice: Prisma

Reasons include:
- Strong TypeScript support.
- Easy schema understanding.
- Clear migrations.
- Strong ecosystem.
- Good compatibility with AI-assisted development.
- Easy onboarding.

PostgreSQL remains the actual database and architecture must not depend on ORM-specific behavior where avoidable.
The ORM choice may be changed through an Architecture Decision Record if a strong reason emerges.

# 17. Telemetry Database
Machine telemetry is time-series data.
Examples include:
```
timestamp
machine_id
device_id

latitude
longitude

state_of_charge

operating_hours

machine_active

speed

other telemetry values
```

Telemetry may produce considerably more records than normal business operations.
The initial architecture will therefore use: TimescaleDB
as a PostgreSQL extension for time-series data.

This allows the system to maintain a PostgreSQL-based architecture while supporting efficient time-based telemetry queries.

---

# 18. Database Separation
The initial implementation does not require completely separate database technologies for:
- Business data.
- Telemetry data.
Both may initially operate in the PostgreSQL ecosystem.
Logical separation should nevertheless remain clear.
Example:
```
Business Tables
    Machines
    Rentals
    Customers
    Maintenance

Telemetry Tables
    TelemetryPoints
    MachineLocations
    TelemetryEvents
```
If telemetry volume becomes extremely large in the future, the architecture may later introduce a specialized analytics or telemetry database.
This should only happen when justified by actual scale.
# 19. Redis
Redis will be used for fast temporary or derived data.
Potential uses include:
- Caching.
- Background queues.
- Device presence.
- Rate limiting.
- Temporary tokens.
- Distributed locks.
- Job coordination.

Redis must not become the authoritative source for important business data.
Important business data must remain stored in PostgreSQL.

---

# 20. Background Jobs
Some operations should not execute directly inside a user's HTTP request.

Examples include:

- Sending email.
- Generating reports.
- Reverse geocoding.
- Processing uploaded documents.
- Processing telemetry.
- Calculating large analytics.
- Sending notifications.
- Import/export operations.

Background processing will use:
- Redis.
- BullMQ.
The worker application may run separately from the primary API.

Example:
```
Backend API
    │
    │ create job
    ▼
Redis / BullMQ
    │
    ▼
Worker
    │
    ├── Email
    ├── Reports
    ├── Notifications
    └── Data processing
```
# 21. Telemetry Architecture

Telemetry ingestion is separated from normal application traffic and must remain provider-independent.

The platform must support:

- Different telemetry providers across the fleet.
- Provider replacement over the lifetime of a machine.
- Multiple active telemetry devices on one machine where required.
- Different transport mechanisms for different providers.
- Provider failure without stopping the rental-management core.

The general architecture is:

```text
Machine / Provider
       │
       ▼
Provider-Specific Transport
       │
       ▼
Telemetry Ingestion Service
       │
       ▼
Provider Adapter
       │
       ├── Device identity
       ├── GPS / IO
       ├── Provider measurements
       └── Configured CAN data where available
       │
       ▼
Machine-Specific Decoder
where required
       │
       ▼
Normalized Telemetry
       │
       ├── Telemetry History
       ├── MachineCurrentState
       ├── Fault Processing
       └── Domain Events
```

Initial provider paths include:

```text
RUPTELA

Machine
  ↓
Ruptela Device
  ↓ Cellular
Ruptela Proprietary Device-to-Server Protocol
  ↓
Our Public Telemetry Endpoint
  ↓
Ruptela Adapter
  ↓
Configured GPS / IO / CAN Data
  ↓
Machine CAN Decoder where required
  ↓
Normalized Telemetry
```

and conceptually:

```text
XTELLIO

Machine
  ↓
Xtellio Device
  ↓
Xtellio Cloud
  ↓
Xtellio API / Streaming Interface
  ↓
Xtellio Adapter
  ↓
Provider-Exposed Parameters
  ↓
Normalized Telemetry
```

The rest of the platform must not depend on whether the originating data came from Ruptela, Xtellio, an OEM provider, or another future integration.

Provider transport is an infrastructure concern. MQTT, REST, streaming APIs, webhooks, proprietary TCP, or other mechanisms may all exist behind provider adapters.

MQTT is not a mandatory platform component.

# 22. Ruptela Transport and CAN Decoding

Ruptela has confirmed that CAN data is sent to our server using Ruptela's proprietary protocol regardless of whether the CAN parameters are standard, supported, custom, or non-automotive.

The platform must therefore not assume a direct Ruptela MQTT path.

Ruptela has also clarified that the device does not indiscriminately transmit the entire surrounding CAN bus. The device sends the specific CAN data enabled in its configuration. If the configuration requests a particular CAN identifier, address, field, or configured data range, that configured information is transmitted; unrelated CAN traffic is not automatically sent.

The expected architecture is:

```text
Machine CAN / GPS / IO
        │
        ▼
Ruptela Device
        │
        │ Cellular
        ▼
Our Public Telemetry Endpoint
        │
        │ Ruptela Proprietary Protocol
        ▼
Ruptela Protocol Adapter
        │
        ├── Device identity
        ├── GPS
        ├── IO / FMIO
        └── Configured CAN Data
        │
        ▼
Machine-Specific CAN Decoder
where machine interpretation is required
        │
        ▼
Normalized Telemetry
```

This creates two separate decoding responsibilities.

## 22.1 Ruptela Device-to-Server Connection

Each Ruptela device is configured with the public hostname or IP address and TCP port of our telemetry ingestion service.

Conceptually:

```text
telemetry.example.com:<configured-port>
```

The Ruptela device initiates the connection over the cellular network. Our server does not normally poll the tracker to retrieve telemetry.

The telemetry endpoint is separate from the normal application API:

```text
api.example.com
→ HTTPS / REST for Web and Mobile

telemetry.example.com
→ Device / Provider Telemetry Traffic
```

When a Ruptela device connects, the telemetry service must:

1. Identify the device using the provider/device identity such as IMEI.
2. Resolve the corresponding `TrackingDevice`.
3. Resolve the applicable `DeviceInstallation`.
4. Resolve the `Machine` and `Organization`.
5. Reject or quarantine unknown or ambiguous device identities.
6. Validate and decode Ruptela packets.
7. Send the acknowledgements required by the Ruptela protocol.

Ruptela devices may buffer records while cellular connectivity is unavailable and transmit them after reconnection. The platform must therefore preserve the device record time separately from the server receive time.

A production deployment may route the public Ruptela TCP endpoint through a TCP-capable load balancer to one or more telemetry-service instances.

## 22.2 Ruptela Protocol Decoding

The first decoding layer understands Ruptela's device-to-server protocol.

Its responsibility is to extract provider-level information such as:

- Device identity.
- Device timestamp.
- GPS.
- IO / FMIO values.
- Configured CAN data.
- Other supported device information.
- Protocol acknowledgements and command responses.

This layer must not contain machine-specific commercial or maintenance interpretation.

## 22.3 Machine CAN Decoding

The second decoding layer understands the CAN protocol of the machine where the provider has exposed configured raw/custom CAN information.

For example, the Ruptela adapter may extract a configured CAN identifier and payload:

```text
CAN ID: 0x200
Data: 42 01 8A 0C 00 00 00 00
```

A machine-specific decoder may interpret it as:

```text
batterySoc = 66
machineActive = true
operatingHours = 321
```

Machine-specific interpretation therefore belongs to our decoder layer rather than being embedded throughout the Ruptela integration.

Not every provider will expose CAN information in this form. If another provider exposes already-decoded parameters, its adapter maps those values directly into the normalized telemetry model.

## 22.4 CAN Decoder Profiles and Device Configuration

Machine-specific CAN decoding must use versioned decoder profiles.

Examples:

- `GALEN_ES_V1`
- `GALEN_ES_V2`
- `GALEN_RT_V1`
- `JLG_600AJ_V1`
- `LINDE_E20_V1`

A machine should be associated with the decoder profile appropriate for its:

- Manufacturer.
- Model.
- Controller.
- CAN protocol version.

Conceptually:

```text
Machine
   │
   ├── Manufacturer: Galen
   ├── Model: ES1012
   └── MachineDecoderAssignment
              │
              ▼
       GALEN_ES_V2
```

The processing flow is:

```text
Configured CAN Data
      │
      ▼
Identify Tracking Device
      │
      ▼
Resolve DeviceInstallation
      │
      ▼
Resolve Machine
      │
      ▼
Resolve Decoder Profile
      │
      ▼
Decode Machine Signal
      │
      ▼
Normalized Telemetry
```

Decoder profiles must be version controlled.

Changes to a machine CAN protocol must not silently modify the interpretation of historical data.

Ruptela device configuration and our decoder profile must remain aligned. If a decoder requires a signal that the Ruptela device has not been configured to capture, the signal is unavailable; missing data must not be treated as zero.

The project should maintain version-controlled machine CAN protocol definitions under a dedicated documentation area such as:

```text
docs/can-protocols/
```

where appropriate.

# 23. Telemetry Provider Adapters

Provider-specific data must not be exposed directly to the rest of the application.

Each provider must have an adapter boundary that handles its own:

- Transport.
- Authentication.
- Device identity.
- Payload format.
- Protocol acknowledgements.
- Provider-specific capabilities.
- Command mechanism.
- Retry / failure semantics.

Conceptually:

```text
                  TELEMETRY PROVIDERS

        ┌────────────────┬────────────────┬────────────────┐
        │                │                │
        ▼                ▼                ▼
     Ruptela          Xtellio        Future / OEM
  Proprietary TCP   Cloud / API       Provider
        │                │                │
        ▼                ▼                ▼
 Ruptela Adapter   Xtellio Adapter   Provider Adapter
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                 Provider-Neutral Data
                         │
                Machine CAN Decoder
                 where required
                         │
                         ▼
                Normalized Telemetry
```

Ruptela-specific information such as an FMIO value or configured CAN field must not be exposed throughout the application.

Likewise, Xtellio-specific parameter names, profile identifiers, API payloads, and credentials must remain inside the Xtellio integration boundary.

The Xtellio integration should currently be treated as cloud/API or streaming based. The exact payload model, authentication method, and stream semantics must come from official Xtellio integration documentation and the enabled customer subscription.

Provider capabilities must be explicit rather than inferred from provider name.

Examples include:

```text
GPS
OPERATING_HOURS
BATTERY_SOC
FAULTS
CUSTOM_CAN
REMOTE_CONTROL
STREAMING
```

The rest of the application should only work with normalized platform concepts and capabilities.

This allows future integrations such as:

- Ruptela.
- Xtellio.
- Teltonika.
- OEM telematics.
- Custom tracking devices.
- Other providers.

without rewriting the rental-management domain.

# 24. Normalized Telemetry Model

The application must define its own telemetry vocabulary.

Examples may include:

```text
batterySoc
operatingHours
machineActive
deviceOnline
latitude
longitude
speed
faultCode
faultSeverity
tiltState
overloadState
```

Provider-specific values are translated into this model before being used by business modules.

Not every machine or device supports every telemetry field. Capabilities must therefore be derived from the actual active devices and integrations rather than from the provider name alone.

Every normalized measurement should preserve source provenance where applicable, including:

```text
provider
tracking_device_id
provider_device_id
recorded_at
received_at
source_signal
decoder_profile
quality
```

Missing values must remain missing. They must not be silently converted into zero.

Historical telemetry and current machine state are separate concerns:

```text
Telemetry History
→ preserves measurements over time

MachineCurrentState
→ read model containing resolved current values
```

The current-state projection should be optimized for fleet screens and operational queries rather than requiring large time-series scans.

# 25. Device and Machine Separation

Tracking devices and machines are separate entities.

The architecture must not permanently bind a tracker directly to one machine through a field such as:

```text
machine.device_id
```

Instead:

```text
Machine
   │
   ▼
DeviceInstallation
   │
   ▼
TrackingDevice
```

A device installation contains information such as:

```text
machine_id
tracking_device_id
installed_at
removed_at
```

This allows devices to be:

- Installed.
- Replaced.
- Removed.
- Repaired.
- Reassigned.
- Temporarily overlapped during provider migration or testing.

A machine may have:

```text
Zero active DeviceInstallations
One active DeviceInstallation
Multiple active DeviceInstallations
```

A physical tracking device should normally have no more than one active machine installation at a time.

Historical telemetry must remain associated with the machine that the device was installed on when the telemetry was recorded.

Machine resolution must therefore use the installation valid at `recorded_at`, not merely the device's current installation.

## 25.1 Multiple Telemetry Sources and Signal Resolution

Multiple active devices may provide complementary data.

Example:

```text
Ruptela
→ GPS + custom CAN

OEM Battery Device
→ SOC + SOH + charge cycles
```

Multiple devices may also report the same canonical signal.

The platform must not universally use:

```text
latest received value wins
```

because a late-arriving packet may contain an older measurement and one source may be more authoritative than another.

Current signal resolution may consider:

- Configured source priority.
- Freshness.
- Device health.
- Measurement quality.
- Availability.

Example:

```text
GPS
Primary: Ruptela
Fallback: Xtellio

Battery SOC
Primary: OEM Battery Device
Fallback: Ruptela
```

Historical telemetry may preserve measurements from all valid sources.

`MachineCurrentState` should expose the resolved current value while preserving enough provenance to explain its origin.

This decision is documented in:

`docs/decisions/ADR-005-MULTIPLE-TELEMETRY-SOURCES-PER-MACHINE.md`

# 26. Recorded Time vs Received Time

Telemetry must distinguish between:

```text
recorded_at
```

and:

```text
received_at
```

For example, a machine may generate a record at:

```text
Monday 14:30
```

but lose cellular connectivity.

The record may arrive at the server:

```text
Tuesday 09:15
```

The telemetry point still belongs to Monday at 14:30.

This distinction is mandatory for:

- Accurate historical analysis.
- Correct DeviceInstallation resolution.
- Source freshness evaluation.
- Offline/store-and-forward handling.
- Current-state protection.

A delayed record must be stored in history but must not incorrectly overwrite a more recent `MachineCurrentState` value merely because it was received later.

# 27. Machine States

Different types of machine state must remain separate.

For example:

```text
Connectivity State
ONLINE
STALE
OFFLINE
UNKNOWN

Operational State
ACTIVE
INACTIVE
CHARGING
UNKNOWN

Rental State
NOT_RENTED
RESERVED
RENTED

Service State
NORMAL
MAINTENANCE_DUE
MAINTENANCE_REQUIRED
OUT_OF_SERVICE
SERVICE_BLOCKED
```

These concepts must not be combined into one generic status value.

A machine may simultaneously be:

```text
Rental State: RENTED
Service State: NORMAL
Connectivity State: OFFLINE
Operational State: UNKNOWN
```

Availability is a derived business concept and must not be confused with rental state.

For example, a machine may be `NOT_RENTED` but still unavailable because:

- A future reservation blocks the requested period.
- Maintenance is scheduled.
- A return inspection is pending.
- The machine is out of service.
- A branch transfer is planned.

This separation is documented in:

`docs/decisions/ADR-007-SEPARATE-MACHINE-STATE-DIMENSIONS.md`

# 28. Live Updates
Some information should update in the user interface without requiring page refreshes.
Examples include:
- Machine online/offline state.
- Machine location.
- New faults.
- Remote command status.
- State of Charge.
- Machine activity.

The initial architecture will use:

WebSockets;
for live server-to-client updates where appropriate.
Normal CRUD operations should continue using REST.

---

# 29. Maps
The initial mapping technology will use:
MapLibre GL
Map data may be provided by services such as:
- MapTiler.
- OpenStreetMap-compatible providers.

The application should avoid tightly coupling the domain model to a specific map provider.
Maps should consume normalized:
latitude
longitude information from the telemetry system.

---

# 30. Reverse Geocoding
Users may need a readable address in addition to GPS coordinates.
Example:
```
39.93, 32.85

→

Akyurt, Ankara, Türkiye
```

Reverse geocoding should not necessarily occur for every telemetry point.
Doing so would create:
- High API usage.
- Unnecessary cost.
- Redundant requests.
Reverse geocoding should instead occur when appropriate, such as:
- When the user requests an address.
- When a machine moves a meaningful distance.
- When location context changes.
- According to caching rules.

Results may be cached.

---

# 31. File and Document Storage
Files should not normally be stored directly inside PostgreSQL.
File types may include:
- Contracts.
- Machine manuals.
- Service manuals.
- Photos.
- Inspection reports.
- Certificates.
- Maintenance reports.
- Invoices.

The architecture will use:
S3-compatible object storage
The database will store metadata such as:

document_id

organization_id

machine_id

file_name

mime_type

storage_key

created_at

while the actual file contents are stored in object storage.

---

# 32. Authentication
Authentication must use established standards.
The preferred architecture is based on:
- OAuth 2.0.
- OpenID Connect.
The application must not implement custom:
- Password hashing schemes.
- Authentication protocols.
- Cryptographic algorithms.
An OIDC-compatible authentication provider will be selected.
Potential providers may include:
- Auth0.
- ZITADEL.
- Keycloak.
- Other suitable OIDC providers.
The final provider decision should be documented through an ADR.

---

# 33. Authorization
Authentication answers:
Who is this user?

Authorization answers:
What is this user allowed to do?

Authorization must be enforced by the backend.
The system will use permission-based access control.
Examples:
```
machine.read

machine.create

machine.update

rental.read

rental.create

maintenance.manage

finance.read

telemetry.read

device.immobilize

users.manage
```

Roles should group permissions rather than being the only authorization mechanism.

Detailed rules belong in 05-AUTH-AND-PERMISSIONS.md

---

# 34. Tenant Isolation
Every tenant-owned request must be scoped to the organization.
Example:
```
Incorrect:
SELECT *
FROM machines
WHERE id = machineId

Required conceptually:
SELECT *
FROM machines
WHERE id = machineId
AND organization_id = currentOrganization
```

Tenant isolation must occur on the backend regardless of frontend behavior.
A user must not be able to access another organization by modifying:
- URL parameters.
- API requests.
- Machine IDs.
- Customer IDs.
- Rental IDs.
Tenant isolation requires automated tests.

---

# 35. Platform Administration

Platform administration must be separated from rental-company administration.

Platform administrators may manage:

- SaaS organizations.
- Subscription state.
- Initial organization onboarding.
- Initial tenant-administrator invitations.
- Device provisioning.
- Technical system status.
- Audited support workflows.

Creating an organization must not require storing a permanent field such as:

```text
organization.general_manager_id
```

Instead, the platform administrator may create an `OrganizationInvitation` for the initial tenant administrator / General Manager.

Conceptually:

```text
Platform Administrator
      ↓
Create Organization
      ↓
Create OrganizationInvitation
      ↓
Invitation Accepted
      ↓
User
      +
Membership
      +
Tenant Role / Permissions
```

After onboarding, an authorized tenant administrator manages the organization's users, roles, memberships, and invitations.

Platform-level access is separate from tenant membership.

A platform administrator must not automatically receive unrestricted access to:

- Rental pricing.
- Customer contracts.
- Machine acquisition costs.
- Profitability.
- Internal maintenance information.

Future support access to customer business data should be explicit, purpose-limited, time-limited where practical, and audited.

# 36. Remote Machine Commands

Remote machine control requires a safety-aware asynchronous command workflow.

A remote command must not directly modify a simple machine field.

Conceptually:

```text
User requests command
        │
        ▼
Authentication
        │
        ▼
Permission Check
        │
        ▼
Device / Provider Capability Check
        │
        ▼
Business / Safety Validation
        │
        ▼
Create DeviceCommand
        │
        ├── Unique command ID
        ├── Expiry
        └── Audit context
        │
        ▼
Provider Adapter
        │
        ▼
Device / Provider
        │
        ▼
Acknowledgement / Result
        │
        ▼
Update DeviceCommand Status
```

Possible command statuses include:

- `REQUESTED`
- `QUEUED`
- `SENT`
- `ACKNOWLEDGED`
- `FAILED`
- `EXPIRED`

A command request is not proof that the physical machine action occurred.

The UI must never consider a remote operation successful merely because the request was submitted.

Remote commands must consider:

- Permission.
- Device capability.
- Provider capability.
- Idempotency.
- Expiry.
- Delivery acknowledgement.
- Failure handling.
- Audit history.

Message delivery retry and physical-action retry are not automatically the same thing.

The cloud platform must not bypass machine-level physical safety logic. For safety-critical actions such as immobilization, the machine/controller must enforce whether and when the requested action can safely occur.

Remote immobilization should use an engineered machine-side safe inhibit mechanism rather than blindly interrupting power or a safety circuit.

This decision is documented in:

`docs/decisions/ADR-009-REMOTE-COMMAND-SAFETY-MODEL.md`

# 37. Audit Logging
Sensitive operations must create immutable or strongly protected audit events.
Examples include:
- User permission changes.
- Remote machine commands.
- Machine ownership changes.
- Device reassignment.
- Financial edits.
- Rental deletion.
- Maintenance changes.

Audit records should contain information such as:
```
 organization

user

action

entity_type

entity_id

timestamp

metadata
```

Detailed audit requirements will be defined in the security documentation.

---

# 38. Notification Architecture
Notifications should be handled through a dedicated notification module.

Business modules should request a notification rather than directly implementing email or push logic themselves.

Example:
```
MaintenanceModule
       │
       │ maintenance due event
       ▼
NotificationModule
       │
       ├── In-app
       ├── Push
       ├── Email
       └── SMS
```
This allows notification channels to change independently of business logic.

---

# 39. Event-Driven Internal Communication

Some internal operations may use application events.

Example:

```text
Normalized Telemetry Received
       │
       ├── Update resolved machine state
       ├── Process faults
       ├── Evaluate maintenance
       └── Evaluate notifications
```

Internal events should be used where they improve separation between modules.

The initial modular monolith does not require a distributed event platform such as Kafka.

MQTT is also not required as an internal platform dependency.

If scale later requires independent telemetry consumers, an internal message broker or streaming platform may be introduced.

Possible future options may include:

```text
MQTT
Kafka
Redis Streams
Cloud-managed event services
```

The choice should be based on actual delivery, fan-out, ordering, replay, scalability, and operational requirements rather than on the fact that the product handles IoT data.

Provider transport and internal messaging are separate decisions.

For example:

```text
Ruptela Device
→ Ruptela Proprietary Protocol
→ Telemetry Ingestion
→ Normalized Telemetry
→ Optional Future Internal Broker
```

# 40. Financial Data
Financial calculations must avoid floating-point errors.
Monetary values should use:
- PostgreSQL numeric, or
- integer minor units where appropriate.
Each monetary amount must include or be associated with its currency.

Examples:
TRY
EUR
USD
GBP

The system must not assume all organizations use Turkish Lira.
Detailed financial calculation rules belong in: 

09-FINANCE-ANALYTICS.md.

---

# 41. Internationalization Architecture
User-facing text should use translation keys.

Incorrect:
```
"Makine Ekle"
```
directly embedded throughout application code.

Preferred:
```
machines.add
```
with translation resources:
tr
en
de
...

Internationalization should support:
- User language.
- Organization default language.
- Browser/device fallback.
- Locale-aware dates.
- Locale-aware numbers.
- Currency formatting.

---

# 42. Time Handling
Internally, timestamps should be stored consistently.
Preferred approach:
- Store timestamps in UTC.
- Convert them for display according to the appropriate user or organization time zone.
Business rules involving dates must consider organization-local time.
Examples include:
- Rental start dates.
- Rental end dates.
- Daily reports.
- Maintenance deadlines.

---

# 43. Analytics
Operational analytics may initially be calculated using PostgreSQL.
Examples:
- Machine utilization.
- Revenue by machine.
- Revenue by category.
- Maintenance costs.
- Fleet availability.
Expensive or frequently requested calculations may later use:
- Cached aggregates.
- Materialized views.
- Background calculations.
A separate enterprise analytics platform should not be introduced until required.

---

# 44. Charts
The web application may use:
Apache ECharts
for advanced dashboards and analytical charts.
Simpler charts may use lightweight alternatives where appropriate.
Charting libraries should consume normalized data from the application API rather than implementing business calculations directly in the UI.

---

# 45. AI Architecture
The AI technical assistant is a future component and must remain separated from core rental operations.

Future high-level architecture may resemble:
```
Technical Documents
       │
       ▼
Document Processing
       │
       ▼
Chunking / Metadata
       │
       ▼
Embeddings
       │
       ▼
Vector Search
       │
       ▼
AI Service
       │
       ├── Machine context
       ├── Fault context
       ├── Maintenance context
       └── Retrieved documentation
       │
       ▼
User Answer
```

The AI system should use Retrieval-Augmented Generation rather than relying solely on model memory.
The AI system should not initially be part of critical machine-control workflows.

---

# 46. Logging and Error Monitoring
The system must provide centralized error monitoring.
Recommended initial service:
Sentry

Sentry may monitor:
- Web application errors.
- Mobile crashes.
- API exceptions.
- Worker failures.
Application logs should include sufficient context to diagnose failures without logging sensitive information unnecessarily.

---

# 47. Observability
As the system grows, observability should use:
OpenTelemetry
where appropriate.
Important operational measurements may include:
- API latency.
- API errors.
- Database latency.
- Background-job failures.
- Telemetry ingestion rate.
- Telemetry processing failures.
- Device command failures.
- Connected device count.

---

# 48. Health Checks
Deployable services should expose health information where appropriate.
Examples:

API health

Database connectivity

Redis connectivity

Telemetry ingestion health

Worker health

Infrastructure monitoring should detect failure before users need to report it manually.

---

# 49. Deployment
The platform will be designed as a *cloud-hosted SaaS application*.
The initial preferred cloud environment is:

Amazon Web Services (AWS)

The architecture should nevertheless remain reasonably cloud-neutral.

A possible production deployment may use:
```
Web
    → hosted Next.js application / container

API
    → Container service

Telemetry Service
    → Container service

Worker
    → Container service

PostgreSQL
    → Managed PostgreSQL

Redis
    → Managed Redis

Object Storage
    → S3

Secrets
    → Secrets Manager

```

Exact AWS services may be selected later through ADRs.

---

# 50. Containers
Server-side applications should be containerized using:
*Docker*

Deployable server components include:

- api

- telemetry

- worker

Containers help ensure consistent behavior between:
- Development.
- Testing.
- Staging.
- Production.

---

# 51. Environments
At minimum, the platform should support separate environments.
Local Development

Staging

Production

Production data must not be casually copied into development environments.
Environment-specific configuration should not be hard-coded into application source code.

---

# 52. Configuration

Application configuration should come from:

- Environment variables.
- Secure secret storage.
- Version-controlled non-secret configuration.

Secrets must not be committed to Git.

Examples of secrets include:

- Database passwords.
- Provider API credentials.
- Ruptela integration credentials where applicable.
- Xtellio API credentials.
- Authentication secrets.
- Email-provider credentials.
- Broker credentials where an internal broker is actually used.

Configuration that determines provider endpoints, public telemetry hostnames, ports, decoder assignments, or capability mappings must be environment-appropriate and must not be hard-coded throughout business logic.

# 53. Infrastructure as Code
Production infrastructure should eventually be defined using:
Terraform

This allows infrastructure to be:
- Version controlled.
- Reviewed.
- Reproducible.
- Documented.

Manual cloud configuration should be minimized as the system matures.

---

# 54. Continuous Integration and Deployment
The repository should use:

GitHub Actions for automated workflows.
Typical CI actions include:

- Install dependencies

- Type check

- Lint

- Run tests

- Build applications

- Run database checks

Deployment workflows may later deploy approved branches or releases into:
- Staging.
- Production.

Production deployment should not occur simply because arbitrary code was pushed to a feature branch.

---

# 55. Testing Architecture
Testing should focus particularly on business and security behavior.
Important test categories include:

- Unit Tests
For isolated business rules.

- Integration Tests
For interaction between:
  - Services.
  - Database.
  - Modules.
  - API Tests For endpoint behavior and validation.
  - Authorization Tests

Authorization Test Examples:
```
Technician cannot view finance.

User from Organization A cannot read Organization B machine.

User without device.immobilize cannot create immobilization command.
```
Telemetry Test Examples:
```
Ruptela protocol value maps correctly into normalized telemetry.

Configured CAN data uses the correct machine decoder profile.

Delayed telemetry preserves recorded_at.

Device is mapped to the installation active at recorded_at.

Multiple telemetry sources resolve according to configured signal priority and freshness.

Unknown devices do not gain tenant access.
```
---

# 56. Database Migrations
Database schema changes must be performed through migrations.
Developers or Codex must not manually modify production database structure without a migration.
Migrations must be:
- Version controlled.
- Reviewable.
- Reproducible.

Potentially destructive migrations require special care.

---

# 57. Backups
Production databases and file storage must have backup policies.
The architecture must support recovery from:
- Accidental deletion.
- Software failure.
- Infrastructure failure.
- Corruption.

Recovery procedures should eventually be tested, not merely assumed.

---

# 58. Caching Strategy
Caching may be used for:
- Dashboard aggregates.
- Machine presence.
- Frequently accessed static information.
- Reverse-geocoding results.
- Session-related temporary state.
Caching must not create incorrect authorization behavior.

Tenant-specific data must never be served from a cache entry belonging to another tenant.

---

# 59. Scalability Strategy
The system should initially prioritize simplicity.
Scaling should occur based on actual usage.

Likely scaling path:
```
Stage 1

One API deployment
One telemetry deployment
One worker deployment
Managed PostgreSQL
Redis


Stage 2

Multiple API instances
Multiple telemetry workers
Multiple background workers
Database optimization


Stage 3

Read replicas
Dedicated analytics workloads
Telemetry partitioning
Additional specialized services


Stage 4

Separate services only where justified
```
The architecture should not attempt to solve Stage 4 problems before Stage 1 is operational.

---

# 60. Expected Initial Scale
The initial system will first operate the company's own rental fleet.
The architecture should nevertheless comfortably support growth into:
- Multiple rental companies.
- Thousands of machines.
- Large telemetry histories.
- Multiple branches.
- Multiple simultaneous users.

The design should not make assumptions that only one company or one fleet will ever exist.

---

# 61. External Integrations

Current and future integrations may include:

- Ruptela telemetry devices.
- Xtellio cloud/API integration.
- OEM telemetry providers.
- Accounting systems.
- ERP systems.
- CRM systems.
- Payment providers.
- SMS providers.
- Email providers.
- Electronic signature systems.
- Additional telemetry providers.

External integrations should preferably exist behind dedicated integration modules or provider adapters.

For example:

```text
AccountingIntegration

EmailProvider

SmsProvider

TelemetryProviderAdapter

StorageProvider
```

Business modules must not contain provider-specific API or protocol code directly.

A failure in one external telemetry provider should not prevent the core rental-management application or unrelated telemetry-provider integrations from continuing to operate where possible.

# 62. Dependency Boundaries
The architecture should generally follow this direction:

```
UI
 ↓
API
 ↓
Application / Domain Logic
 ↓
Repositories / Infrastructure
 ↓
Database / External Providers
```
Dependencies should not normally flow in the opposite direction.

For example:
```
The domain layer should not depend on React.
The Machine module should not depend on MapLibre.
The Finance module should not know how Ruptela protocol packets or Xtellio payloads are formatted.
```
---

# 63. Business Logic Location
Authoritative business logic belongs on the backend.

Examples include:
- Whether a machine can be rented.
- Whether rentals overlap.
- Whether a user can immobilize a machine.
- Whether maintenance blocks availability.
- How ROI is calculated.
- How utilization is calculated.

Frontend applications may present the rules to users but must not be the only place where those rules are enforced.

---

# 64. UI and Database Separation

Neither the web nor mobile application may directly connect to the production database.

Required architecture:
```
Web / Mobile
      │
      ▼
Backend API
      │
      ▼
Business logic
      │
      ▼
Database
```

This rule applies even when direct database access would appear faster to implement.


# 65. No Provider-Specific Leakage
Provider-specific implementation details must remain inside provider integrations.
Examples that should not appear throughout the product:

- ruptelaFmio1201

- ruptelaCommandString

- awsSpecificMachineLogic

Instead the application should use concepts such as:

- batterySoc

- immobilizeMachine()

- storeDocument()

Adapters translate these operations into provider-specific implementations.

---

# 66. Architecture Decision Records

Important technical decisions are documented under:

```text
docs/decisions/
```

The current baseline ADR set is:

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

An ADR should normally contain:

- Title.
- Status.
- Context.
- Decision.
- Reasons.
- Consequences.
- Reconsideration criteria where useful.

Major baseline decisions should not be silently reversed during implementation. If an architectural choice changes, the relevant ADR and dependent documentation must be updated deliberately.

# 67. Initial Architectural Decisions

The following decisions are currently considered part of the baseline architecture.

| Area | Decision |
|---|---|
| Primary language | TypeScript |
| Repository | pnpm + Turborepo |
| Web | Next.js |
| Web UI | Tailwind CSS + shadcn/ui |
| Mobile | React Native + Expo |
| Backend | NestJS |
| Backend style | Modular monolith |
| API | REST |
| Live updates | WebSockets |
| Database | PostgreSQL |
| ORM / typed database access | Prisma initially, subject to ADR if changed |
| Time-series | TimescaleDB |
| Cache | Redis |
| Background jobs | BullMQ |
| Telemetry architecture | Provider-specific transport behind telemetry adapters |
| Ruptela transport | Ruptela proprietary device-to-server protocol |
| Xtellio transport | Xtellio cloud/API or streaming integration, according to official provider capabilities |
| Internal MQTT | Not required initially; optional future messaging mechanism |
| Machine CAN decoding | Server-side versioned decoder profiles where configured/raw CAN is available |
| Device relationship | Historical `DeviceInstallation`; multiple active devices per machine are supported |
| Signal resolution | Explicit per-signal source resolution; not simply latest received value |
| Maps | MapLibre GL |
| Charts | Apache ECharts |
| Validation | Zod |
| File storage | S3-compatible object storage |
| Authentication | OpenID Connect compatible provider |
| Authorization | Permission-based, configurable tenant roles |
| Error monitoring | Sentry |
| Observability | OpenTelemetry |
| Containers | Docker |
| CI/CD | GitHub Actions |
| Infrastructure | Terraform |
| Initial cloud target | AWS |

Changes to major baseline choices should be documented with an ADR.

# 68. Architecture Rules

The following rules should remain true unless an explicit architectural decision changes them.

1. The web and mobile applications must not directly access the production database.
2. Business rules must be enforced by the backend.
3. Tenant isolation must be applied on the backend.
4. Platform-level administration must remain separate from tenant business-data access.
5. Authorization must check permissions rather than fixed role names.
6. Provider-specific telemetry fields must not leak into the general application domain.
7. Provider transport details must remain behind provider adapters.
8. A TrackingDevice and a Machine are separate entities.
9. Device-to-machine history must be represented through `DeviceInstallation`.
10. A machine may have zero, one, or multiple active telemetry devices.
11. A physical tracking device should normally have at most one active machine installation.
12. Telemetry must preserve both `recorded_at` and `received_at`.
13. Delayed telemetry must not overwrite newer current state incorrectly.
14. Multiple sources for the same signal require explicit source resolution.
15. “Latest received value wins” is not a universal telemetry rule.
16. Missing telemetry must not be interpreted as zero unless explicitly defined by the source protocol.
17. Rental, service, connectivity, and operational state must remain separate.
18. Ruptela telemetry is received through Ruptela's proprietary protocol; direct MQTT is not required.
19. Ruptela sends configured CAN data rather than an unrestricted copy of the surrounding CAN bus.
20. Machine-specific CAN decoding must be versioned and separated from provider protocol decoding.
21. MQTT is optional internal infrastructure, not a required architectural layer.
22. Provider failure must not stop unrelated providers or the core rental application where avoidable.
23. Financial calculations must not rely on floating-point arithmetic.
24. Remote machine commands must use an acknowledged, auditable, idempotent, expiring workflow.
25. A requested remote command must not be presented as physically executed until the relevant confirmation exists.
26. Machine-side control remains responsible for physical safety.
27. Sensitive actions must be auditable.
28. User-visible strings must support internationalization.
29. New microservices must not be introduced without a clear reason.
30. External service integrations should use adapters or dedicated integration modules.
31. Secrets must never be committed to source control.
32. Database changes require migrations.
33. New dependencies should not be introduced without understanding why they are required.
34. Architecture documentation and ADRs must be updated when major system behavior changes.

# 69. Architecture Summary

The initial platform is a TypeScript-based monorepo containing:

```text
Next.js Web Application

React Native / Expo Mobile Application

NestJS Backend API

Telemetry Ingestion Service

Background Worker
```

The core business backend uses a modular-monolith architecture with explicit domain boundaries.

Business data is stored in PostgreSQL.

Time-series telemetry is stored using TimescaleDB.

Redis supports caching and background work.

Telemetry is provider-independent:

```text
Provider-Specific Transport
        ↓
Telemetry Ingestion Service
        ↓
Provider Adapter
        ↓
Machine CAN Decoder where required
        ↓
Normalized Telemetry
```

Ruptela devices connect to our public telemetry endpoint using Ruptela's proprietary device-to-server protocol. The platform decodes the Ruptela transport format and then applies a versioned machine-specific CAN decoder where configured/custom CAN data requires interpretation.

Xtellio is treated as a separate cloud/API or streaming integration. Provider-side decoded parameters are mapped through the Xtellio adapter into the same normalized telemetry model.

A machine may have multiple telemetry devices and providers over its lifetime or simultaneously. `DeviceInstallation` preserves the device-to-machine relationship over time, and an explicit source resolver determines which measurement is authoritative when multiple devices provide the same canonical signal.

MQTT is not required in the initial Ruptela path and is not a mandatory internal component. It may be introduced later if an internal publish/subscribe use case justifies it.

Web and mobile applications interact only with the platform API.

Files are stored using S3-compatible object storage.

Authentication uses established OpenID Connect standards, while authorization uses configurable permission-based tenant roles.

Remote commands are modeled as asynchronous, auditable operations where a request is not equivalent to physical execution and machine-side control remains responsible for safe physical behavior.

The initial deployment target is AWS, while provider abstractions should prevent unnecessary cloud or telemetry-provider lock-in.

The system is intentionally designed to support growth without introducing unnecessary distributed-system complexity during the initial product phase.

# 70. Related Documentation

```
Product definition:
01-PROJECT-OVERVIEW.md
Domain entities and relationships:
03-DOMAIN-MODEL.md
UI structure and behavior:
04-UI-UX.md
Authentication and authorization:
05-AUTH-AND-PERMISSIONS.md
Telemetry and IoT:
06-TELEMETRY-IOT.md
Rental business rules:
07-RENTAL-BUSINESS-RULES.md
Maintenance:
08-MAINTENANCE.md
Finance and analytics:
09-FINANCE-ANALYTICS.md
Security:
10-SECURITY.md
Coding standards:
11-CODING-STANDARDS.md
```


One distinction in this document is especially important to keep in head:

**Next.js and React Native are the interfaces; NestJS is the brain; PostgreSQL is the permanent business memory; TimescaleDB handles the large telemetry history; Redis is temporary/fast working memory; the telemetry service is the entrance for data coming from the machines.**

