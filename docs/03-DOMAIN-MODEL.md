# 03 - Domain Model

## Document Status

Status: Draft  
Version: 0.2  
Project: Rental Management and Equipment Tracking Platform

---

# 1. Purpose of This Document

This document defines the core business entities of the platform and the relationships between them.

It answers questions such as:

- What is a Machine?
- What is a Rental?
- How is a tracking device connected to a machine?
- How are users connected to rental companies?
- How are customers represented?
- How is maintenance recorded?
- How are financial records associated with machines?
- How is telemetry associated with the correct machine?
- Which information is authoritative and which information is derived?

This document defines the conceptual domain model.

It is not intended to define every database column or SQL implementation detail.

Detailed database schemas may evolve during implementation while preserving the domain concepts defined here.

---

# 2. Domain Modeling Principles

The following principles apply throughout the domain model.

## 2.1 Organization Ownership

The platform is multi-tenant.

Most business entities belong to exactly one:

`Organization`

Examples include:

- Machines.
- Customers.
- Rentals.
- Branches.
- Tracking devices.
- Maintenance records.
- Financial records.

Tenant-owned data must never exist without a clear organization owner.

---

## 2.2 Historical Information Must Be Preserved

The system should avoid overwriting information when historical relationships matter.

For example, this is not sufficient:

```text
Machine.device_id = 123
```

because the device may later be moved to another machine.

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

records when the relationship started and ended.

The same principle applies where appropriate to:

- Device installations.
- Machine assignments to rentals.
- CAN decoder versions.
- Maintenance history.
- Financial history.

---

## 2.3 Different Types of State Must Remain Separate

A machine does not have only one meaningful status.

For example:

```text
Rental State:
NOT_RENTED / RESERVED / RENTED

Service State:
NORMAL / MAINTENANCE_DUE / MAINTENANCE_REQUIRED / OUT_OF_SERVICE / SERVICE_BLOCKED

Connectivity State:
ONLINE / STALE / OFFLINE / UNKNOWN

Operational State:
ACTIVE / INACTIVE / CHARGING / UNKNOWN

Asset Lifecycle:
ACTIVE / SOLD / RETIRED
```

These states represent different concepts and must not be collapsed into one generic `machine_status` field.

Machine availability is a separate derived concept based on these state dimensions plus reservations, assignments, maintenance blocks, transfers, and other operational restrictions.

---

## 2.4 Derived Information Should Not Replace Source Data

Values such as:

- ROI.
- Profit.
- Fleet utilization.
- Current availability.
- Current machine status.

may be calculated from more fundamental records.

Where performance requires it, calculated values may be cached or materialized.

The underlying source data must remain authoritative.

---

## 2.5 Historical Business Data Must Not Change Because Master Data Changed

For example, if a machine was rented for:

```text
15,000 TRY / month
```

and the standard rental price later becomes:

```text
18,000 TRY / month
```

the historical rental must remain:

```text
15,000 TRY / month
```

Rental transactions therefore store pricing snapshots rather than relying on the current price list.

---

# 3. High-Level Domain Map

The main relationships can be viewed conceptually as:

```text
                              PLATFORM
                                 │
                     ┌───────────┴───────────┐
                     │                       │
                     ▼                       ▼
              PlatformAccess            Organization
                                             │
                                   OrganizationInvitation
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
           Branch                         Customer                       Membership
                                             │                              │
                                             ▼                              ▼
                                           Rental                         Role
                                             │                              │
                                         RentalItem                    Permissions
                                             │
                                  RentalMachineAssignment
                                             │
                                             ▼
                                           Machine
                                             │
             ┌───────────────────────────────┼────────────────────────────────┐
             │                               │                                │
             ▼                               ▼                                ▼
      DeviceInstallation                 WorkOrder                       FaultEvent
             │
             ▼
       TrackingDevice
             │
             ├── TelemetryProvider
             └── Provider / Device Capabilities
             │
             ▼
      Normalized Telemetry
             │
             ├── Source Provenance
             └── MachineSignalSourceRule
                     │
                     ▼
             MachineCurrentState

Machine
   ├── MachineDecoderAssignment → DecoderProfile
   ├── MachineMaintenancePlan → MaintenancePlan
   ├── FinancialEntry
   ├── MachineAcquisition
   ├── Documents
   └── DeviceCommand
```

The platform must support more than one active `DeviceInstallation` on the same machine when required.

A physical tracking device should normally have no more than one active machine installation at a time.

---

# 4. Organization

`Organization` represents one customer company using the SaaS platform.

For example:

```text
BADAL Kiralama
```

or:

```text
Rental Company A
```

Each organization forms a tenant boundary.

Typical organization information includes:

```text
id

name

legal_name

tax_information

default_currency

default_language

timezone

country

status
```

An organization may contain:

```text
Branches

Users through Memberships

Customers

Machines

Tracking Devices

Rentals

Maintenance

Financial Records

Documents
```

All organization-owned information must be isolated from other organizations.

---

# 5. User

`User` represents a human identity in the platform.

A user is global rather than directly belonging to one organization.

The same user may theoretically belong to more than one organization.

For this reason, `User` must not directly contain an authoritative:

```text
organization_id
```

Tenant membership is represented through `Membership`.

Platform-level access is also separate from tenant membership.

Conceptually:

```text
User
 ├── Membership → Organization
 └── PlatformAccess
```

A user who has platform-administration responsibilities does not automatically become a member of every tenant organization.

---

# 6. Membership

`Membership` connects a `User` to an `Organization`.

Example:

```text
User:
Ahmet Yılmaz

Organization:
BADAL Kiralama

Membership:
ACTIVE
Roles:
Operations Manager
```

Typical information includes:

```text
user
organization
membership_status
joined_at
roles
branch_scope
```

A membership may contain branch restrictions.

For example:

```text
User may access:

Ankara Branch
Istanbul Branch

but not:

Izmir Branch
```

Membership deactivation removes tenant access without deleting the global user identity or historical audit records.

Detailed access rules belong in `05-AUTH-AND-PERMISSIONS.md`.

---

# 7. Role, Permission, Platform Access, and Organization Invitation

## 7.1 Role and Permission

A `Role` groups permissions.

Authorization must ultimately use permissions rather than fixed role names.

Example permissions include:

```text
machine.read
rental.reserve
rental.assign_machine
maintenance.complete
maintenance.block_machine
finance.profitability.view
machine.remote_control
roles.manage
```

Tenant roles are configurable.

The platform may provide default role templates such as:

```text
General Manager
Rental Manager
Service Manager
Technician
```

but these are templates, not mandatory organizational structures.

An authorized tenant administrator may:

- enable or disable appropriate default role templates;
- rename tenant roles;
- create custom tenant roles;
- modify allowed tenant-role permissions;
- assign roles to memberships.

For example, one company may use:

```text
Operations Manager
```

with both rental and maintenance permissions instead of separate Rental Manager and Service Manager roles.

The backend must not contain authorization rules such as:

```text
role == "Service Manager"
```

when the actual requirement is a permission.

Platform-level roles and permissions are not tenant roles and cannot be modified by tenant administrators.

The platform must prevent unsafe administration states such as disabling an assigned role without handling existing memberships or removing all tenant administration capability.

## 7.2 PlatformAccess

`PlatformAccess` represents platform-level privileges that are separate from organization memberships.

Examples may include:

```text
PLATFORM_ADMIN
PLATFORM_SUPPORT
PLATFORM_OPERATIONS
```

Platform access may allow actions such as:

- creating an organization;
- suspending an organization;
- managing subscription state;
- viewing technical platform health;
- resending an organization's initial administrator invitation.

Platform access does not automatically grant unrestricted access to tenant:

```text
financial records
rental prices
customer contracts
internal maintenance notes
```

Future support access to tenant business data should be explicit, time-limited where practical, purpose-limited, and audited.

## 7.3 OrganizationInvitation

`OrganizationInvitation` represents an invitation to join an organization.

The normal organization-onboarding flow is:

```text
Platform Administrator
      ↓
Create Organization
      ↓
Create OrganizationInvitation
for initial tenant administrator
      ↓
User Accepts Invitation
      ↓
Create or reuse User
      ↓
Create Membership
      ↓
Assign authorized tenant role
```

Typical invitation information may include:

```text
organization
email
invited_by
intended_roles
status
created_at
expires_at
accepted_at
```

After initial onboarding, an authorized tenant administrator can invite additional users.

The organization should not store a permanent field such as:

```text
general_manager_id
```

because General Manager is an authorization role/membership concept rather than an intrinsic property of the organization.

---

# 8. Branch

`Branch` represents an operational location of an organization.

Examples:

```text
Ankara Branch

Istanbul Branch

Antalya Branch
```

A branch may contain or manage:

- Machines.
- Employees.
- Rentals.
- Service operations.

A machine may have a home branch.

The machine's physical GPS location must remain separate from its organizational branch assignment.

For example:

```text
Home Branch:
Ankara

Current GPS Location:
Antalya customer site
```

These are different concepts.

---

# 9. Customer

`Customer` represents the party renting equipment.

Customers belong to one organization.

The initial implemented Customer, contact and address contracts are detailed in
[Customer implementation](15-CUSTOMER-IMPLEMENTATION.md). Customers are shared
organization records, not branch-owned records. Billing addresses are canonical
CustomerAddress records; inactive customers and their history are retained.

A customer may be:

```text
COMPANY
```

or:

```text
INDIVIDUAL
```

Typical information includes:

```text
customer_number

type

legal_name

display_name

tax_number

tax_office

notes

status
```

A customer may have multiple:

```text
Contacts

Addresses

Rentals

Documents
```

---

# 10. Customer Contact

`CustomerContact` represents a person associated with a customer.

Example:

```text
Customer:
ABC Construction

Contact:
Mehmet Kaya
Site Manager
+90 ...
mehmet@...
```

A company may therefore have multiple contacts for:

- Purchasing.
- Accounting.
- Site management.
- Technical communication.
- Management.

---

# 11. Customer Address

A customer may have multiple addresses.

Examples include:

```text
Registered Address

Billing Address

Delivery Address

Worksite
```

Addresses should not be assumed to be identical.

Rental delivery locations may also be stored as snapshots so that historical rentals are not changed if the customer's master address changes later.

---

# 12. Machine

`Machine` represents one physical rentable asset.

Examples:

```text
Galen ES1012
Serial: ES1012-00125

JLG 600AJ
Serial: ...
```

A machine belongs to one organization.

The initial implemented aggregate, static specification contracts, branch access,
independent state dimensions and acquisition-data permissions are documented in
[Machine implementation](16-MACHINE-IMPLEMENTATION.md). Telemetry and device
relationships are not implemented in this phase.

Typical machine information includes:

```text
internal_fleet_number

serial_number

manufacturer

model

category

year

purchase_date

home_branch

asset_lifecycle_status
```

Technical attributes may include:

```text
working_height

platform_height

lifting_capacity

machine_weight

power_type

drive_type
```

Not every machine category will use the same technical attributes.

The model must therefore avoid assuming that every rentable machine is a scissor lift.

---

# 13. Machine Model

`MachineModel` represents reusable technical information shared by machines of the same model.

Example:

```text
MachineModel:

Manufacturer:
Galen

Model:
ES1012

Category:
Scissor Lift
```

Possible model-level information includes:

```text
working_height

platform_height

rated_capacity

dimensions

power_type

manufacturer documentation
```

Individual machine records contain information specific to the physical unit.

For example:

```text
Machine Model:
ES1012

Machine:
Serial ES1012-00057
Purchased 2026
Purchase price 9,500 EUR
```

Initially, organizations may create the machine models they require.

A shared platform-level equipment catalog may be introduced later if beneficial.

---

# 14. Machine Category

`MachineCategory` describes the general equipment type.

Examples include:

```text
Scissor Lift

Articulated Boom Lift

Telescopic Boom Lift

Spider Lift

Forklift

Telehandler

Other
```

The architecture must allow additional categories without requiring fundamental application changes.

---

# 15. Machine Current State

Frequently requested machine state should be available through a current-state read model.

Conceptually:

`MachineCurrentState`

may contain information such as:

```text
rental_state
service_state
connectivity_state
operational_state

latest_latitude
latest_longitude
latest_battery_soc
latest_operating_hours

last_seen_at
active_fault_count
```

`MachineCurrentState` is not the authoritative source of historical telemetry or commercial history.

For example:

```text
latest_battery_soc = 63
```

may be stored for fast dashboard access while historical values remain in telemetry storage.

When multiple active devices provide the same canonical signal, `MachineCurrentState` must contain the value selected by the telemetry source-resolution rules rather than simply the most recently received provider value.

Where useful, the current-state projection should retain enough provenance to explain which source produced an authoritative value.

---

# 16. Telemetry Provider and Provider Connection

## 16.1 TelemetryProvider

`TelemetryProvider` represents a supported external telemetry technology or provider integration.

Examples include:

```text
RUPTELA
XTELLIO
OEM_PROVIDER
FUTURE_PROVIDER
```

The entity/configuration describes the integration identity and supported integration type, not a machine itself.

Provider transport may include:

```text
PROPRIETARY_TCP
REST_API
STREAMING_API
MQTT
WEBHOOK
OTHER
```

Transport type is an integration concern and must not become a rental or maintenance business concept.

Provider capability varies by device, configuration, and subscription. The platform must not assume capability solely from provider name.

## 16.2 TelemetryProviderConnection

`TelemetryProviderConnection` represents organization/provider integration configuration where provider-level account or connection configuration is required.

Typical information may include:

```text
organization
provider
status
external_account_reference
configuration_reference
capabilities
created_at
updated_at
```

Secrets must not be stored as ordinary readable domain fields. Secure secret storage should be referenced through infrastructure configuration.

Not every provider requires the same connection model. For example, a direct Ruptela device-to-server deployment may rely primarily on provisioned devices and our public telemetry listener, while a cloud provider may require account-level API credentials or subscription information.

The domain model must allow both without forcing one provider's structure onto another.

## 16.3 TrackingDevice

`TrackingDevice` represents a physical telematics unit.

Typical information includes:

```text
organization
provider
provider_device_id
imei
serial_number
device_model
hardware_version
firmware_version
status
last_seen_at
capabilities
```

A tracking device belongs to an organization even when it is temporarily not installed on a machine.

Tracking devices and machines are separate entities.

The platform must support Ruptela, Xtellio, OEM, and future devices through the same conceptual entity.

Capabilities must describe what the actual device/integration can do, such as:

```text
GPS
OPERATING_HOURS
BATTERY_SOC
FAULTS
CUSTOM_CAN
REMOTE_CONTROL
```

rather than assuming features from provider name alone.

---

# 17. Device Installation

`DeviceInstallation` records the physical installation of a tracking device on a machine.

Typical information includes:

```text
machine
tracking_device
installed_at
removed_at
installed_by
removed_by
purpose
notes
```

Example:

```text
Device RUP-123

installed on:

Machine ES1012-001

2026-01-01 → 2026-06-01
```

The same device may later be installed on:

```text
Machine ES1212-014

2026-06-02 →
```

Historical telemetry must be associated with the machine on which the device was installed at the telemetry `recorded_at` time.

A physical tracking device should normally have no more than one active machine installation at a time.

A machine, however, may have zero, one, or multiple active `DeviceInstallation` records.

Examples include:

```text
Ruptela:
GPS + custom CAN

OEM Battery Device:
SOC + SOH + charging cycles
```

or temporary overlap during provider migration/testing.

Multiple active devices on one machine are therefore a supported domain requirement, not merely a future exception.

---

# 18. Normalized Telemetry Sample and Source Provenance

`TelemetrySample` represents provider-independent normalized machine telemetry.

Typical values may include:

```text
recorded_at
received_at

machine
tracking_device
provider
provider_device_id

latitude
longitude
speed

battery_soc
operating_hours
machine_active

source_signal
decoder_profile
quality
```

Additional signals may exist depending on the equipment.

Not every telemetry point needs to contain every signal.

Every normalized measurement must preserve enough source provenance to determine where it came from.

At minimum, provenance should be capable of identifying:

```text
provider
tracking_device
provider_device_id
recorded_at
received_at
source signal / provider field
decoder profile where applicable
quality / validity information where available
```

Telemetry must distinguish `recorded_at` from `received_at` because devices may buffer records while cellular connectivity is unavailable.

Delayed historical telemetry must remain in history but must not incorrectly overwrite a newer current-state value.

---

# 19. Provider Source Data and Configured CAN Data

Provider-level source data may be retained when useful for troubleshooting, decoder development, reprocessing, or auditability.

For Ruptela, the platform must not assume that the tracker streams the entire CAN bus.

Ruptela has confirmed that the device transmits the specific CAN data configured for collection.

Conceptually:

```text
Machine CAN Bus
      ↓
Ruptela Device
      ↓
Configured CAN identifiers / fields
      ↓
Ruptela Proprietary Protocol
      ↓
Ruptela Adapter
      ↓
Machine Decoder Profile where required
      ↓
Normalized Telemetry
```

Depending on device configuration and provider capability, source information may represent:

```text
configured CAN bytes
CAN identifier + payload
provider IO/FMIO values
provider-decoded values
other provider source fields
```

Provider source data is technical input and should not be exposed directly to normal rental, maintenance, or finance modules.

Raw/provider source storage may use a shorter retention period than normalized telemetry if volume becomes significant.

If provider source data is retained, it must preserve enough metadata to support deterministic reprocessing.

---

# 19A. Machine Signal Source Rule

`MachineSignalSourceRule` defines which telemetry source is preferred for a canonical signal when more than one active device can provide it.

Example:

```text
Machine:
ES1012-0041

Signal:
GPS

Primary:
Ruptela Device

Fallback:
Xtellio Device
```

while:

```text
Signal:
battery_soc

Primary:
OEM Battery Device

Fallback:
Ruptela Device
```

Source selection may consider:

```text
configured priority
freshness
device health
measurement quality
availability
```

The system must not use a universal rule such as:

```text
latest received value wins
```

because delayed records may arrive after newer observations.

Historical storage may preserve measurements from all valid sources.

The resolver determines which source contributes to `MachineCurrentState`.

Source rules may be configured at platform, model, organization, or machine level as the implementation evolves, but the resulting resolution must be deterministic and auditable.

---

# 20. Decoder Profile

`DecoderProfile` describes how proprietary machine CAN data is interpreted.

Examples:

```text
GALEN_ES_V1

GALEN_ES_V2

GALEN_RT_V1

JLG_600AJ_V1
```

A decoder profile should be versioned.

Conceptually, it defines rules such as:

```text
CAN ID:
0x200

Byte:
0

Signal:
batterySoc

Scale:
1

Unit:
%
```

Decoder profiles are technical platform configuration rather than normal rental-company business data.

---

# 21. Machine Decoder Assignment

The machine must be associated with the decoder profile appropriate for its CAN protocol.

The association should preserve history.

Conceptually:

```text
Machine
   │
   ▼
MachineDecoderAssignment
   │
   ▼
DecoderProfile
```

Typical information:

```text
machine

decoder_profile

valid_from

valid_to
```

This allows a machine's controller software or CAN protocol to change over time without changing the interpretation of older telemetry.

Telemetry should use the decoder profile valid when the CAN frame was recorded.

---

# 22. Fault Definition

`FaultDefinition` describes the meaning of a known machine fault.

Example:

```text
Machine Model:
ES1012

Fault Code:
17

Description:
Platform overload sensor disagreement

Severity:
HIGH
```

Fault definitions may later reference:

- Troubleshooting instructions.
- Service manuals.
- Recommended actions.
- AI knowledge sources.

---

# 23. Fault Event

`FaultEvent` represents an actual fault detected on a physical machine.

Typical information includes:

```text
machine

fault_code

source

severity

first_seen_at

last_seen_at

cleared_at

status

occurrence_count
```

A fault event is different from a fault definition.

Conceptually:

```text
FaultDefinition
"What does code 17 mean?"
```

versus:

```text
FaultEvent
"Machine ES1012-001 has code 17 active right now."
```

---

# 24. Device Command

`DeviceCommand` represents a requested remote action against a capable tracking-device/machine integration.

Examples include:

```text
IMMOBILIZE
ENABLE
REQUEST_STATUS
RESET_DEVICE
```

Typical information includes:

```text
organization
machine
tracking_device
provider

command_type
requested_by
requested_at

queued_at
sent_at
acknowledged_at

status
failure_reason
expires_at

idempotency_key
```

Possible statuses include:

```text
REQUESTED
QUEUED
SENT
ACKNOWLEDGED
FAILED
EXPIRED
```

A remote machine action must not be represented as a simple boolean update.

The platform must verify that the selected active device/integration actually supports the required command capability.

A command request is not proof of physical execution.

Provider acknowledgement and, where technically available, confirmed machine/device safe state must remain distinguishable.

Commands must support expiry and idempotency so stale or repeated requests do not unintentionally execute later.

Every sensitive command must create an audit record.

Machine/controller safety logic remains authoritative for whether a requested physical action can safely occur.

---

# 25. Rental

`Rental` represents one commercial rental transaction with a customer.

A rental belongs to:

```text
Organization
Customer
```

and may contain multiple `RentalItem` records.

A rental should not represent only one machine.

Typical information includes:

```text
rental_number
customer
branch

planned_start_at
planned_end_at
actual_start_at
actual_end_at

currency
status

delivery_information
collection_information
customer_reference
notes
```

Possible lifecycle states include:

```text
DRAFT
QUOTED
RESERVED
ACTIVE
COMPLETED
CANCELLED
```

`OVERDUE` is normally a derived operational condition rather than a replacement for this core lifecycle.

Telemetry must not automatically start, extend, complete, or cancel a rental.

Detailed lifecycle rules belong in `07-RENTAL-BUSINESS-RULES.md`.

---

# 26. Rental Item

`RentalItem` represents one commercial equipment requirement inside a rental.

For example:

```text
Rental R-2026-001

Item 1:
12 m Electric Scissor Lift
Quantity: 2
Rate: 25,000 TRY / month each
```

A RentalItem may initially describe a requested:

```text
Machine Category
Machine Model
Equipment Specification
Specific Machine
Quantity
```

This allows a company to confirm a reservation before deciding exactly which physical fleet units will be delivered.

A RentalItem is not the same as an additional rental charge such as transport or cleaning. Those belong to `RentalCharge`.

RentalItems must preserve agreed pricing as historical snapshots.

Changing the standard price later must not change historical rentals.

---

# 27. Rental Machine Assignment

A `RentalMachineAssignment` connects a physical machine to a rental item.

This relationship is separate from the RentalItem because machines may be allocated later, replaced, partially returned, or serve different portions of the contractual period.

Example:

```text
Rental Item:
1 × 12 m Scissor Lift

Assignment 1:
ES1012-004
01 Nov → 12 Nov

Assignment 2:
ES1012-009
12 Nov → 30 Nov
```

The system must preserve both assignments.

Typical information includes:

```text
rental_item
machine
assigned_at
released_at
assignment_reason
replacement_reason
```

A single rental may therefore contain multiple physical machines and a machine may be replaced without creating a new rental.

Assignment periods are also required for machine-level revenue attribution.

---

# 28. Rental Charges

Charges that do not directly represent a physical machine should remain separately identifiable.

Examples include:

```text
Transport

Collection

Insurance

Damage Waiver

Cleaning

Fuel

Operator

Discount

Other
```

A `RentalCharge` may therefore be associated with the rental.

Detailed pricing rules will be defined later.

---

# 29. Machine Availability

Machine availability must not be stored as an arbitrary authoritative boolean such as:

```text
available = true
```

Availability is time-dependent and must be derived from relevant business conditions.

Conceptually:

```text
Asset Lifecycle
      +
Rental / Reservation State
      +
Physical Machine Assignments
      +
Service State
      +
Blocking Maintenance / Inspection
      +
Branch Transfer / Operational Hold
      ↓
Derived Availability
```

A machine may be unavailable because it is:

```text
Reserved
Rented
Awaiting Return Inspection
Under Blocking Maintenance
Out of Service
Transferred
Sold
Retired
```

Availability must be calculated for requested future periods as well as the present.

Unassigned category/model reservations consume planned fleet capacity even before exact physical machines are selected.

A current availability projection may be materialized for performance, but the underlying source records remain authoritative.

---

# 30. Maintenance Plan

`MaintenancePlan` defines recurring maintenance requirements.

Examples:

```text
Every 500 operating hours
```

or:

```text
Every 12 months
```

A maintenance plan may contain both triggers.

Example:

```text
Service every:

500 operating hours

OR

12 months

whichever occurs first
```

A plan may be designed for:

```text
Machine Model

Machine Category

Specific Machine
```

Detailed maintenance rules belong in `08-MAINTENANCE.md`.

---

# 31. Machine Maintenance Plan

`MachineMaintenancePlan` assigns a maintenance plan to a physical machine.

Conceptually:

```text
Machine
   │
   ▼
MachineMaintenancePlan
   │
   ▼
MaintenancePlan
```

This allows different machines to use different service schedules even when they belong to the same category.

---

# 32. Work Order

`WorkOrder` represents maintenance or repair work performed or planned on a machine.

A work order may be:

```text
PREVENTIVE

CORRECTIVE

INSPECTION

OTHER
```

Typical information includes:

```text
machine

type

status

created_at

scheduled_at

started_at

completed_at

assigned_technician

operating_hours

description

diagnosis

work_performed

cost
```

Completed work orders form the maintenance history.

A separate duplicate `MaintenanceHistory` entity is therefore not required for normal cases.

Historical maintenance imported from another system may be represented as completed work orders.

---

# 33. Maintenance and Machine Availability

Maintenance may affect machine availability.

For example:

```text
OPEN Work Order
        │
        ▼
Machine Service State
        │
        ▼
MAINTENANCE
```

However, not every work order necessarily requires taking the machine out of service.

The maintenance domain must explicitly determine whether the work prevents rental or operation.

---

# 34. Financial Entry

`FinancialEntry` represents a financial amount relevant to operational fleet analysis.

The purpose of this entity is management accounting and machine profitability analysis.

It is not intended initially to replace full accounting software.

Examples include:

```text
Rental Revenue

Machine Purchase Cost

Transport Cost

Maintenance Cost

Repair Cost

Financing Cost

Insurance Cost

Other Operating Cost
```

Typical information includes:

```text
organization

type

category

amount

currency

recognized_at

machine

rental

customer

source

notes
```

Relationships may be optional depending on the entry.

For example:

```text
Machine Purchase Cost
    → Machine

Rental Revenue
    → Rental + Machine

Corporate Expense
    → Organization
```

---

# 35. Financial Source Records

Where a financial entry is generated from another domain entity, the relationship should be preserved.

Example:

```text
WorkOrder
    │
    ▼
Maintenance Cost
    │
    ▼
FinancialEntry
```

or:

```text
Rental
    │
    ▼
Rental Revenue
    │
    ▼
FinancialEntry
```

This allows financial reports to explain where amounts came from.

Financial totals should not be manually duplicated across many tables.

---

# 36. Machine Acquisition

Machine purchase information is important enough to model explicitly.

A `MachineAcquisition` may contain:

```text
machine

supplier

purchase_date

purchase_price

currency

transport_cost

customs_cost

other_acquisition_cost
```

These records provide the basis for:

- Machine investment cost.
- ROI.
- Payback-period calculations.

Relevant amounts may also generate financial entries.

---

# 37. Document

`Document` represents a stored file known to the platform.

Examples include:

```text
Machine Manual

Service Manual

Certificate

Rental Contract

Customer Document

Maintenance Report

Invoice

Photo
```

Typical metadata includes:

```text
organization

file_name

mime_type

storage_key

uploaded_by

uploaded_at

document_type
```

Documents may be associated with entities such as:

```text
Machine

Customer

Rental

WorkOrder

Organization
```

The physical file remains in object storage.

---

# 38. Notification

`Notification` represents information delivered to a user because something happened in the system.

Examples:

```text
Critical machine fault

Maintenance due

Rental ending soon

Machine offline

Remote command failed
```

Typical information includes:

```text
organization

recipient

notification_type

created_at

read_at

related_entity

severity
```

External delivery through:

```text
Push

Email

SMS
```

should remain separate from the underlying notification event.

---

# 39. Audit Event

`AuditEvent` records sensitive user or system actions.

Examples:

```text
USER_PERMISSION_CHANGED

MACHINE_CREATED

FINANCIAL_ENTRY_CHANGED

DEVICE_INSTALLED

DEVICE_REMOVED

IMMOBILIZATION_REQUESTED

IMMOBILIZATION_ACKNOWLEDGED

RENTAL_CANCELLED
```

Typical audit information includes:

```text
organization

actor_user

action

entity_type

entity_id

timestamp

metadata
```

Audit history should not behave like ordinary editable business data.

---

# 40. Core Relationship Summary

The main domain relationships are:

```text
User
 ├── PlatformAccess
 │
 └── Membership
       │
       └── Organization
              │
              ├── OrganizationInvitation
              ├── Branch
              ├── Role → Permissions
              │
              ├── Customer
              │      │
              │      └── Rental
              │             ├── RentalItem
              │             │      └── RentalMachineAssignment
              │             │                 └── Machine
              │             └── RentalCharge
              │
              ├── TelemetryProviderConnection
              │
              ├── TrackingDevice
              │      ├── TelemetryProvider
              │      └── DeviceInstallation
              │                 └── Machine
              │
              ├── Machine
              │      ├── MachineModel
              │      ├── DeviceInstallation
              │      ├── MachineSignalSourceRule
              │      ├── MachineDecoderAssignment
              │      │       └── DecoderProfile
              │      ├── TelemetrySample
              │      ├── FaultEvent
              │      ├── DeviceCommand
              │      ├── MachineMaintenancePlan
              │      │       └── MaintenancePlan
              │      ├── WorkOrder
              │      ├── FinancialEntry
              │      ├── MachineAcquisition
              │      ├── Document
              │      └── MachineCurrentState
              │
              ├── MaintenancePlan
              ├── FinancialEntry
              ├── Notification
              └── AuditEvent
```

The important boundary is that provider-specific telemetry structures terminate at the provider/decoder integration layer. Rental, maintenance, and finance consume normalized machine concepts.

---

# 41. Important Domain Rules

The following rules are considered fundamental.

## 41.1 Tenant Ownership

Every tenant-owned business record must resolve to exactly one organization.

Platform-level access is separate from tenant membership.

## 41.2 Organization Onboarding

A platform administrator creates the organization and normally sends an `OrganizationInvitation` to the initial tenant administrator.

Accepting the invitation creates or activates the appropriate `Membership`.

General Manager is a role/membership concept, not a permanent foreign key on `Organization`.

## 41.3 Permission-Based Authorization

Tenant roles are configurable permission collections.

Business logic must authorize by permission rather than fixed role names.

Platform roles remain separate from tenant roles.

## 41.4 Provider Independence

Provider-specific protocol fields and payloads must stop at provider adapters/decoders.

Core business domains consume normalized telemetry.

## 41.5 Device Installation History

A tracking device cannot be considered permanently attached to a machine.

Installation history must be preserved.

A physical device should normally have no more than one active machine installation.

A machine may have multiple active device installations.

## 41.6 Telemetry Machine Resolution

Telemetry must be associated with the machine using the `DeviceInstallation` valid at:

```text
recorded_at
```

rather than merely using the installation current at `received_at`.

## 41.7 Multiple Telemetry Sources

More than one active device may produce the same canonical signal.

The authoritative current value must be selected through explicit source-resolution rules.

The system must not universally use `latest received wins`.

## 41.8 Source Provenance

Normalized telemetry must preserve enough metadata to identify its provider, tracking device, source signal, timing, and decoder context where applicable.

## 41.9 Decoder Version History

Configured/raw CAN information must be decoded using the decoder profile valid when the data was generated.

Historical decoder assignments must therefore be preserved.

## 41.10 Ruptela Configured CAN

Ruptela must not be modeled as streaming the complete CAN bus automatically.

The device sends CAN data that has been enabled/configured for acquisition.

Device configuration and server-side decoder requirements must remain aligned.

## 41.11 Separate Machine State Dimensions

Rental, service, connectivity, operational, and asset-lifecycle state are separate concepts.

Availability is derived rather than acting as a replacement for these states.

## 41.12 Rental History

A reservation may be created by category/model before exact machines are assigned.

Changing current customer master data, standard price, or machine assignments must not rewrite historical rental records.

Machine replacement and partial return history must be preserved.

## 41.13 Maintenance History

Maintenance history belongs to the machine, not to a tracking device or provider.

Telemetry-provider changes must not reset maintenance schedules.

## 41.14 Financial Currency and History

Every monetary value must have a clear currency.

Financial values must not use JavaScript floating-point numbers as the authoritative representation.

Historical agreed prices and relevant conversion snapshots must remain reproducible.

## 41.15 Remote Commands

A requested remote command is not equivalent to a successfully executed physical command.

Capability, expiry, idempotency, acknowledgement, auditability, and machine-side safety must be preserved.

## 41.16 Auditability

Sensitive actions must remain attributable to the user or system process responsible for them.

---

# 42. Deletion and Historical Data

Business entities with historical significance should generally not be physically deleted simply because they are no longer active.

Examples include:

```text
Machines

Customers with rental history

Rentals

Tracking device installations

Work orders

Financial entries
```

Instead, entities may use concepts such as:

```text
ACTIVE

INACTIVE

ARCHIVED

CANCELLED

RETIRED
```

depending on the domain.

Physical deletion may still be appropriate for records created accidentally when no dependent historical information exists.

Exact deletion rules will be defined per module.

---

# 43. Identifiers

Internal entities should use stable system-generated identifiers.

Business-facing entities may additionally have human-readable numbers.

Example:

```text
Internal ID:
01J...

Rental Number:
R-2026-00124

Machine Fleet Number:
AWP-0042

Customer Number:
CUS-00125
```

Business numbers must not be relied upon as database primary keys.

---

# 44. Time

Historical entities should preserve relevant timestamps.

Examples include:

```text
created_at

updated_at

installed_at

removed_at

assigned_at

completed_at

recorded_at

received_at
```

System timestamps should be stored consistently.

Business dates should be interpreted using the organization's relevant timezone.

---

# 45. Current State vs History

The platform should intentionally separate:

```text
Current State
```

from:

```text
Historical Events
```

For example:

```text
MachineCurrentState

batterySoc = 74
```

answers:

> What is the battery level now?

while:

```text
TelemetrySample
```

answers:

> What has the battery level been over the last three months?

Similarly:

```text
MachineCurrentState.rentalState
```

answers:

> Is the machine currently rented?

while:

```text
RentalMachineAssignment
```

answers:

> Who rented this machine in February?

This distinction should remain consistent throughout the application.

---

# 46. Initial Core Domain

The first release should prioritize the following domain entities and conceptual records:

```text
Organization
OrganizationInvitation

User
Membership
Role
Permission
PlatformAccess

Branch

Customer
CustomerContact
CustomerAddress

Machine
MachineModel
MachineCategory
MachineCurrentState

TelemetryProvider
TelemetryProviderConnection
TrackingDevice
DeviceInstallation
MachineSignalSourceRule

DecoderProfile
MachineDecoderAssignment

TelemetrySample
FaultDefinition
FaultEvent
DeviceCommand

Rental
RentalItem
RentalMachineAssignment
RentalCharge

MaintenancePlan
MachineMaintenancePlan
WorkOrder

FinancialEntry
MachineAcquisition

Document
Notification
AuditEvent
```

Not every conceptual entity must necessarily become one database table.

Physical schema design may combine or separate records where appropriate while preserving these domain concepts.

Additional entities should be introduced only when required by defined product behavior.

---

# 47. Important Design Decisions Made in This Model

### A rental can contain multiple machines.

A rental is a commercial transaction rather than a direct connection between one customer and one machine.

### Reservations may exist before exact machines are assigned.

A RentalItem may specify category, model, specification, and quantity before physical allocation.

### A rental item and a physical machine assignment are separate.

This supports later allocation, machine replacement, and partial returns.

### A machine and a tracking device are separate.

Device installation history is preserved.

### A machine may have multiple active telemetry devices.

Different devices may provide different signals or overlap during provider migration.

### A physical tracking device normally has only one active machine installation.

Historical device movement remains possible through closed DeviceInstallations.

### Telemetry is provider-independent after the adapter boundary.

Ruptela, Xtellio, OEM, and future providers feed the same normalized telemetry model.

### Signal-source resolution is explicit.

When multiple devices provide the same canonical signal, the platform resolves the authoritative current value using source rules rather than arrival order alone.

### CAN decoder assignments are versioned.

Changing a machine CAN protocol does not silently change the interpretation of historical telemetry.

### Current machine state is separate from telemetry history.

Dashboards use a current-state projection while historical observations remain in time-series storage.

### Platform access and tenant membership are separate.

A platform administrator does not automatically receive unrestricted tenant business-data access.

### Tenant roles are configurable permission collections.

Default role names are templates rather than authorization logic.

### Maintenance history is represented primarily by completed work orders and related technical records.

Changing telemetry provider does not change machine maintenance history.

### Financial entries provide operational financial analysis.

The platform is not initially intended to become a complete statutory accounting system.

### Machine availability is derived.

It is not an independently controlled boolean.

### Remote commands are asynchronous domain records.

A request is distinct from delivery, acknowledgement, and physical execution.

---

# 48. Remaining Open Domain Decisions

The following areas remain intentionally open because they depend on future product scope rather than unresolved core architecture.

## 48.1 Customer Credit, Invoices, and Payment Tracking

The current domain includes operational financial entries but does not make the platform a complete accounting or receivables system.

If required later, additional concepts may include:

```text
Invoice
Payment
Receivable
Credit Limit
Outstanding Balance
```

These should be added only if the product is expected to own those workflows rather than integrate with an external accounting/ERP system.

## 48.2 Inventory, Accessories, and Spare Parts

The current model focuses primarily on serialized machines.

If the platform later manages:

```text
Safety harnesses
Chargers
Cables
Attachments
Consumables
Spare parts
```

additional inventory concepts may be required.

Maintenance work orders should already be able to record parts used without requiring a complete warehouse module.

## 48.3 External / Sub-Rented Equipment

Future versions may allow rentals to be fulfilled using:

```text
OWN_FLEET
EXTERNAL_RENTAL
PARTNER_FLEET
```

If this becomes part of the product, the machine/source model should be extended without changing historical rental semantics.

## 48.4 Provider-Specific Integration Details

Exact Ruptela configured-CAN representation, supported identifier formats, device authentication, and command acknowledgement behavior remain integration details to confirm with the provider.

Exact Xtellio API, streaming, authentication, raw-CAN exposure, and profile behavior must be based on official provider documentation.

These open integration details must not change the provider-independent core domain model.

---

# 49. Related Documentation

System architecture:

`02-SYSTEM-ARCHITECTURE.md`

User interface:

`04-UI-UX.md`

Authentication and permissions:

`05-AUTH-AND-PERMISSIONS.md`

Telemetry architecture:

`06-TELEMETRY-IOT.md`

Rental business rules:

`07-RENTAL-BUSINESS-RULES.md`

Maintenance:

`08-MAINTENANCE.md`

Financial calculations:

`09-FINANCE-ANALYTICS.md`

Security:

`10-SECURITY.md`
