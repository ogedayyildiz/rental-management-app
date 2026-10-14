# 06 - Telemetry and IoT

## Document Status

Status: Draft  
Version: 1.0  
Project: Rental Management and Equipment Tracking Platform

---

# 1. Purpose of This Document

This document defines the architecture and business rules for machine telemetry and IoT integration.

It describes:

- Telemetry providers.
- Tracking devices.
- Device installation history.
- Multiple telemetry devices on one machine.
- Multiple telemetry providers operating simultaneously.
- Changing telemetry providers.
- Provider-specific integrations.
- Ruptela integration.
- Xtellio integration.
- GPS data.
- CAN-bus data.
- Custom machine CAN protocols.
- Server-side CAN decoding.
- Decoder profiles.
- Normalized telemetry.
- Telemetry capabilities.
- Signal source selection.
- Current machine state.
- Historical telemetry.
- Fault processing.
- Device connectivity.
- Remote machine commands.
- Provider failures.
- Data quality.
- Telemetry security boundaries.

The primary architectural objective is:

> The rental-management platform must understand machine information without depending on how a particular telemetry provider delivers that information.

---

# 2. Core Telemetry Principle

The application must be telemetry-provider independent.

The business application should work with concepts such as:

```text
latitude

longitude

batterySoc

operatingHours

machineActive

faultCode

batteryTemperature
```

It should not normally work with concepts such as:

```text
Ruptela FMIO ID

Ruptela packet type

Xtellio API property name

Provider-specific CAN representation

Provider-specific MQTT topic
```

Provider-specific implementation details must stop inside the telemetry integration layer.

---

# 3. Telemetry Is Optional

A machine does not require telemetry in order to exist in the platform.

The following functions must continue working for an untracked machine:

```text
Machine Management

Rental Management

Customer Management

Maintenance

Finance

Documents

Reports
```

Telemetry adds physical machine information to the business system.

It must not become a requirement for basic rental operations.

---

# 4. High-Level Architecture

The platform must support different telemetry providers simultaneously.

Conceptually:

```text
                              MACHINE

                 ┌──────────────┼──────────────┐
                 │              │              │
                 ▼              ▼              ▼

              Ruptela        Xtellio        Provider C
                 │              │              │
                 ▼              ▼              ▼

           Provider-Specific Communication / Cloud

                 │              │              │
                 ▼              ▼              ▼

          Ruptela Adapter  Xtellio Adapter  Provider Adapter
                 │              │              │
                 └──────────────┼──────────────┘
                                │
                                ▼

                       Normalized Telemetry
                                │
                                ▼

                      Signal Source Resolver
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼

      Telemetry History   Machine Current    Fault / Event
                              State            Processing
                                │
                                ▼

                         Business Platform

                  Rental / Maintenance / Finance
                         Web / Mobile / API
```

The provider adapters may receive information using completely different technologies.

Their normalized output should follow the same platform model.

---

# 5. Supported Provider Scenarios

The architecture must support several scenarios.

## 5.1 Different Providers Across the Fleet

Example:

```text
Machine A → Ruptela

Machine B → Ruptela

Machine C → Xtellio

Machine D → Future Provider
```

The organization does not need to use one telemetry provider for its entire fleet.

---

## 5.2 Replacing a Provider

Example:

```text
Machine A

2026 - 2028:
Ruptela

2028 onward:
Xtellio
```

Changing the telemetry provider must not change the identity of the machine or destroy its historical information.

---

## 5.3 Multiple Devices on One Machine

A machine may have more than one active telemetry device.

Example:

```text
Machine
   │
   ├── Ruptela
   │      GPS
   │      Operating Hours
   │      Custom CAN
   │
   └── Battery OEM Device
          Battery SOC
          Battery Temperature
          Charge Cycles
          Battery Health
```

The platform should be able to combine telemetry from both sources.

---

# 6. Telemetry Provider

`TelemetryProvider` represents an external telemetry ecosystem.

Examples:

```text
RUPTELA

XTELLIO

TELTONIKA

OEM_TELEMATICS

CUSTOM
```

A provider may use:

```text
Direct device connection

Proprietary TCP protocol

REST API

Streaming API

MQTT

Webhook

Other integration method
```

The provider transport mechanism is an infrastructure concern.

It must not control the rental-business domain.

---

# 7. Telemetry Provider Connection

Some providers require an organization or platform account connection.

A `TelemetryProviderConnection` represents this integration where required.

Possible information includes:

```text
id

organization_id

provider

status

external_account_id

credential_reference

created_at

updated_at

last_successful_connection_at
```

Secrets such as:

```text
API tokens

Passwords

Private keys

Client secrets
```

must not be stored as ordinary plaintext business data.

They should be stored using secure secret-management infrastructure.

Not every provider requires an organization-level provider connection.

For example, a direct device-to-server integration may identify devices individually.

---

# 8. Tracking Device

`TrackingDevice` represents a physical telemetry device.

Typical information includes:

```text
id

organization_id

provider

provider_device_id

imei

serial_number

device_model

hardware_version

firmware_version

status

last_seen_at
```

A tracking device belongs to one organization.

A machine and a tracking device are separate entities.

---

# 9. Device Installation

The relationship between a machine and a tracking device must be represented using:

`DeviceInstallation`

Typical information includes:

```text
id

machine_id

tracking_device_id

installed_at

removed_at

installed_by

notes
```

Example:

```text
Ruptela Device R-001

Machine:
AWP-0042

Installed:
2026-01-10

Removed:
2028-04-15
```

The same physical device may later be installed on another machine.

Historical installation records must remain preserved.

---

# 10. Multiple Active Installations

A machine may have multiple active `DeviceInstallation` records.

Example:

```text
Machine AWP-0042

Installation 1:
Ruptela tracker

Installation 2:
Battery monitoring device
```

However, one physical tracking device must not normally be actively installed on two machines simultaneously.

Conceptually:

```text
One Machine
    → zero, one, or many active telemetry devices

One Physical Device
    → maximum one active machine installation
```

unless a future device architecture explicitly requires otherwise.

---

# 11. Provider Replacement

Changing telemetry provider must preserve history.

Example:

```text
Machine:
AWP-0042

Ruptela Device
Installed:
2026-01-10

Removed:
2028-04-15


Xtellio Device
Installed:
2028-04-14

Removed:
NULL
```

A short overlap may intentionally be used during provider migration.

This allows:

```text
Old Provider
     +
New Provider
     ↓
Compare Data
     ↓
Verify New Integration
     ↓
Make New Provider Primary
     ↓
Remove Old Device
```

Historical telemetry from the old provider remains available.

---

# 12. Provider Adapter

Each telemetry provider must have its own adapter.

Conceptually:

```text
Provider Communication
        │
        ▼
Provider Adapter
        │
        ▼
Normalized Telemetry
```

Examples:

```text
Ruptela Proprietary Protocol
        ↓
Ruptela Adapter
```

```text
Xtellio Cloud API / Streaming
        ↓
Xtellio Adapter
```

```text
Future MQTT Provider
        ↓
Provider Adapter
```

The adapter is responsible for converting provider-specific information into platform concepts.

---

# 13. Provider Adapter Responsibilities

A provider adapter may be responsible for:

```text
Authentication

Device identification

Protocol parsing

API requests

Streaming connections

Payload validation

Provider timestamps

Provider-specific error handling

Provider-specific command translation

Provider health

Normalization
```

The provider adapter must not contain rental-specific business rules.

For example, it must not decide:

```text
batterySoc < 15%
→ Notify Service Manager
```

The adapter should only produce:

```text
batterySoc = 14
```

The business system decides what that means.

---

# 14. Ruptela Integration

Ruptela is the first direct-device telemetry integration.

Ruptela has confirmed that device data is sent using:

**Ruptela's proprietary protocol**

This includes:

```text
GPS information

Supported CAN information

Custom CAN information

Configured raw CAN data

Other configured device information
```

The architecture must therefore not assume that GPS or supported CAN information arrives directly through MQTT.

The expected path is:

```text
Machine
   │
   ▼
Ruptela Device
   │
   │ Cellular
   ▼
Ruptela Proprietary Protocol
   │
   ▼
Telemetry Ingestion Service
   │
   ▼
Ruptela Adapter
   │
   ▼
Provider Data
   │
   ▼
Machine CAN Decoder
when required
   │
   ▼
Normalized Telemetry
```

MQTT may still be used inside our own infrastructure after telemetry has been decoded.

It is not required as the Ruptela device-to-platform transport.

## 14.1 Ruptela Device to Server Connection 
Ruptela devices communicate directly with our telemetry infrastructure using Ruptela's proprietary device-to-server protocol. Each Ruptela device is configured with the public hostname or IP address and TCP port of our telemetry ingestion service, for example `telemetry.example.com:<port>`, and the device itself initiates the connection over the cellular network; our platform does not normally connect to the device in order to retrieve telemetry. This endpoint is separate from the normal HTTPS/REST business API used by the web and mobile applications. When a Ruptela device connects, the telemetry ingestion service identifies the device using its provider identity such as IMEI, resolves it to the corresponding `TrackingDevice`, `DeviceInstallation`, `Machine`, and `Organization`, validates that the device is known and authorized, receives Ruptela protocol packets, validates and decodes them, extracts GPS, IO, and the CAN data that has been explicitly enabled in the device configuration, and sends the acknowledgements required by the Ruptela protocol. Ruptela devices may buffer records while cellular connectivity is unavailable and transmit them later when the connection is restored, therefore `recorded_at` must always be preserved separately from `received_at`, and delayed historical telemetry must not incorrectly overwrite newer machine state. The Ruptela telemetry listener should be independently deployable from the normal business API so that persistent device connections and telemetry traffic can scale separately from rental-management traffic; in production, a stable public telemetry hostname may route TCP traffic through a TCP-capable load balancer to one or more telemetry ingestion instances. After the Ruptela protocol has been decoded, any configured custom CAN data that still requires machine-specific interpretation is passed to the appropriate versioned machine CAN decoder and then converted into the platform's normalized telemetry model. MQTT is not required for this Ruptela device-to-server path; if MQTT or another message broker is introduced later, it should be treated as an optional internal messaging mechanism after provider data has been received and normalized, rather than as part of the required Ruptela transport architecture.

---

# 15. Ruptela CAN Acquisition

Ruptela has confirmed that its standard firmware can capture custom CAN data from non-automotive machinery.

A custom tracker firmware version is not required simply to capture custom CAN identifiers.

However, the tracker does not necessarily transmit the entire CAN bus.

The device sends only the CAN information enabled in its configuration.

Example:

```text
Machine CAN Bus

CAN ID A
CAN ID B
CAN ID C
CAN ID D

Ruptela Configuration:

✓ CAN ID A
✓ CAN ID C
✗ CAN ID B
✗ CAN ID D
```

The platform should expect to receive:

```text
CAN ID A

CAN ID C
```

and not the complete CAN traffic.

---

# 16. Ruptela Configuration Responsibility

For every supported custom machine protocol, the required CAN information must be identified.

Example:

```text
GALEN_ES_V1

Required data:

CAN ID 0x200
CAN ID 0x201
CAN ID 0x205
CAN ID 0x320
```

The Ruptela device must be configured to capture the required data.

If a required CAN address is not enabled in the device configuration, our server cannot decode information that was never transmitted.

Device configuration and server decoder configuration must therefore remain compatible.

---

# 17. Ruptela Protocol Decoding

The first decoding layer is provider-specific.

Conceptually:

```text
Ruptela Binary Packet
        ↓
Ruptela Protocol Decoder
        ↓
Device Data
```

The result may contain information such as:

```text
Device identity

Timestamp

GPS position

IO information

Configured CAN information

Device status

Command responses
```

This layer understands Ruptela.

It should not need to understand the meaning of Galen-specific CAN bytes.

---

# 18. Machine CAN Decoding

Custom machine CAN information may require another decoding layer.

Example input:

```text
CAN ID:
0x200

Payload:
42 01 8A 0C 00 00 00 00
```

Machine-specific decoding may produce:

```text
batterySoc = 66

machineActive = true

operatingHours = 321
```

Conceptually:

```text
Ruptela Protocol Decoder
        ↓
Configured CAN Data
        ↓
Machine CAN Decoder
        ↓
Normalized Machine Signals
```

The Ruptela protocol decoder and machine CAN decoder are separate responsibilities.

---

# 19. Decoder Profile

`DecoderProfile` defines how a specific machine CAN protocol is interpreted.

Examples:

```text
GALEN_ES_V1

GALEN_ES_V2

GALEN_RT_V1

JLG_600AJ_V1

LINDE_E20_V1
```

Decoder profiles must be versioned.

---

# 20. Decoder Profile Content

A decoder profile may contain information such as:

```text
Protocol Name

Protocol Version

CAN Bus

CAN Baud Rate

CAN Identifier

11-bit / 29-bit Identifier

Start Bit

Signal Length

Byte Order

Signed / Unsigned

Scale

Offset

Unit

Normalized Signal Name

Valid Range
```

Example:

```text
Signal:
Battery SOC

CAN ID:
0x200

Start Bit:
0

Length:
8

Unsigned:
Yes

Scale:
1

Offset:
0

Unit:
%

Normalized Name:
batterySoc
```

---

# 21. Machine Decoder Assignment

A machine must use the correct decoder profile for the protocol installed on the machine.

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
machine_id

decoder_profile_id

valid_from

valid_to
```

---

# 22. Decoder Version History

Decoder assignments must preserve history.

Example:

```text
Machine:
AWP-0042

GALEN_ES_V1
Valid:
2026-01-01 → 2027-05-01

GALEN_ES_V2
Valid:
2027-05-01 →
```

Telemetry generated before the controller update must not later be interpreted using the new CAN definition.

The relevant decoder should be determined using:

`recorded_at`

---

# 23. CAN Protocol Ownership

Machine CAN protocol documentation belongs to us, not to the telemetry provider.

The repository should maintain version-controlled protocol definitions.

Example:

```text
docs/
    can-protocols/

        galen-es-v1.md
        galen-es-v2.md
        galen-rt-v1.md
```

Changing telemetry provider should not cause us to lose ownership of machine protocol knowledge.

---

# 24. Xtellio Integration

Xtellio represents a different type of telemetry integration.

Rather than receiving the device's native communication directly, our platform may consume telemetry through the Xtellio cloud integration interfaces.

Conceptually:

```text
Machine
   │
   ▼
Xtellio Device
   │
   ▼
Xtellio Cloud
   │
   ▼
API / Streaming Integration
   │
   ▼
Xtellio Adapter
   │
   ▼
Normalized Telemetry
```

The exact endpoint names, message formats, authentication details, supported signals, and streaming behavior must be implemented according to Xtellio's official API specification.

They must not be guessed from the general architecture.

---

# 25. Xtellio Integration Boundary

The rest of the platform should not know that telemetry came through an Xtellio cloud API.

For example:

```text
Xtellio response
        ↓
Xtellio Adapter
        ↓
operatingHours = 428.5
```

The Maintenance module receives:

```text
operatingHours = 428.5
```

It does not need to know:

```text
provider == XTELLIO
```

---

# 26. Future Providers

New telemetry providers should be added through new adapters.

Example:

```text
Provider D
   │
   ▼
Provider D Adapter
   │
   ▼
Normalized Telemetry
```

Adding a telemetry provider should not require rewriting:

```text
Rentals

Customers

Finance

Maintenance

Machine Detail

Dashboard

Reports
```

---

# 27. Normalized Telemetry

The telemetry subsystem must define a provider-independent signal vocabulary.

Initial examples include:

```text
latitude

longitude

altitude

speed

heading

batterySoc

batteryVoltage

batteryTemperature

operatingHours

machineActive

charging

odometer

energyUsage

idleTime

faultCode

faultSeverity

tiltState

overloadState
```

Additional normalized signals may be introduced as required.

---

# 28. Signal Naming

Normalized names must represent business or machine meaning.

Preferred:

```text
batterySoc

operatingHours

machineActive
```

Avoid:

```text
ruptelaField1201

xtellioValueX

canByte3

fmio409
```

Provider and protocol details belong below the normalization boundary.

---

# 29. Missing Signal Values

Unavailable telemetry must not be represented as zero.

Example:

```text
batterySoc = null
```

means:

> Battery State of Charge is unavailable.

It does not mean:

> Battery State of Charge is 0%.

The same applies to:

```text
operatingHours

temperature

speed

location

fault state
```

---

# 30. Signal Units

Normalized signals must have defined units.

Examples:

```text
batterySoc
%

operatingHours
hours

batteryTemperature
°C

energyUsage
kWh

distance
km
```

Frontend applications must not independently guess signal units.

---

# 31. Signal Source Metadata

Every normalized telemetry measurement should preserve sufficient source information.

Possible metadata includes:

```text
provider

tracking_device_id

provider_device_id

recorded_at

received_at

source_signal

decoder_profile_id

quality
```

Example:

```text
Signal:
batterySoc

Value:
74

Provider:
XTELLIO

Tracking Device:
device_924

Recorded At:
2026-10-09T08:30:00Z
```

Provider metadata is important for traceability and troubleshooting.

---

# 32. Telemetry Capabilities

Not every device or machine can provide every signal.

Capabilities must therefore be explicitly represented.

Example:

```text
Ruptela Device

✓ GPS
✓ Operating Hours
✓ Custom CAN
✓ Digital Output
```

Another device may provide:

```text
Battery Device

✓ Battery SOC
✓ Battery Temperature
✓ Charge Cycles
✓ Battery Health
```

The machine's effective capabilities are the combination of its active device capabilities.

---

# 33. Capability-Based UI

The user interface should display features based on actual capabilities.

For example:

If the machine does not provide:

```text
batterySoc
```

the UI should not show:

```text
Battery:
0%
```

It should either omit the field or show:

```text
Not Available
```

Similarly, a remote immobilization button must only exist where:

```text
the provider supports it

the device supports it

the machine implementation supports it

the organization enables it

the user has permission
```

---

# 34. Multiple Sources for the Same Signal

Multiple active devices may provide the same normalized signal.

Example:

```text
Ruptela:

batterySoc = 72


OEM Battery Device:

batterySoc = 74
```

Both values may be valid measurements.

The platform must determine which source is authoritative for current machine state.

---

# 35. Signal Source Priority

Signal priority should be configurable.

Example:

```text
Signal:
batterySoc

Primary:
OEM Battery Device

Fallback:
Ruptela
```

while:

```text
Signal:
location

Primary:
Ruptela

Fallback:
Xtellio
```

Source selection may consider:

```text
Configured Priority

Freshness

Device Health

Data Quality

Signal Availability
```

The latest received value should not automatically win.

---

# 36. Signal Source Resolver

Conceptually:

```text
Ruptela Signal ────────┐
                       │
Xtellio Signal ────────┼──► Signal Source Resolver
                       │
OEM Signal ────────────┘
                                │
                                ▼
                       MachineCurrentState
```

The resolver determines the value used for the machine's current state.

Historical telemetry from all valid sources remains available.

---

# 37. Source Override

Authorized technical users may eventually be allowed to define explicit source priority.

Example:

```text
Machine:
AWP-0042

Operating Hours:

1. Machine Controller via Ruptela
2. Xtellio
3. Manual Reading
```

The source configuration must be auditable if it affects important business calculations.

---

# 38. Recorded Time and Received Time

Every telemetry measurement must distinguish:

```text
recorded_at
```

from:

```text
received_at
```

`recorded_at`:

> When the machine/device generated the information.

`received_at`:

> When our platform received it.

These may be different because of connectivity interruptions or cloud-provider delays.

---

# 39. Offline Buffering

Example:

```text
14:00

Machine generates telemetry.

14:01

Cellular network fails.

17:30

Connection returns.

17:31

Stored telemetry arrives.
```

The record still belongs to:

```text
14:00
```

not:

```text
17:31
```

Historical analysis must use the device/source timestamp where it is reliable.

---

# 40. Out-of-Order Telemetry

Telemetry may arrive out of chronological order.

Example arrival sequence:

```text
10:05

10:03

10:04
```

The platform must not assume arrival order equals machine chronology.

Historical ordering uses:

`recorded_at`

---

# 41. Delayed Data and Current State

Delayed historical data must not replace newer current state.

Example:

```text
Current Position

recorded_at:
15:00
```

Later the platform receives:

```text
Position

recorded_at:
13:00
```

The 13:00 measurement belongs in history.

It should not replace the current 15:00 position.

---

# 42. Current Machine State

Frequently accessed machine information should be maintained in:

`MachineCurrentState`

Possible fields include:

```text
machine_id

connectivity_state

operational_state

latitude

longitude

location_recorded_at

battery_soc

battery_soc_recorded_at

operating_hours

operating_hours_recorded_at

active_fault_count

last_seen_at
```

Different signals may have different latest timestamps and different source devices.

---

# 43. Current State Is a Read Model

`MachineCurrentState` exists for performance and usability.

It answers:

> What is the latest trusted state of this machine?

It is not the authoritative historical telemetry record.

For example:

```text
MachineCurrentState

batterySoc = 74
```

does not replace the historical battery measurements.

---

# 44. Telemetry History

Historical normalized telemetry should be stored in time-series storage.

Initial technology:

```text
PostgreSQL

+

TimescaleDB
```

Telemetry history should preserve:

```text
Organization

Machine

Tracking Device

Provider

Signal

Value

Recorded Time

Received Time

Source Metadata
```

The final physical database layout may optimize this representation.

---

# 45. Raw Provider Data

Raw provider payloads may be retained for:

```text
Development

Debugging

Protocol verification

Support

Reprocessing
```

Raw provider payloads should not become the normal business API.

Retention may be shorter than normalized telemetry retention.

---

# 46. Raw / Configured CAN Data

CAN source data may also be retained temporarily where useful.

Reasons include:

```text
Decoder testing

Protocol troubleshooting

Reprocessing

Machine protocol development
```

Raw CAN information may create significantly more storage than normalized telemetry.

Retention must therefore be configurable.

---

# 47. Decoder Reprocessing

Where raw source data is still available, the platform may eventually support reprocessing telemetry using a corrected decoder.

Example:

```text
Original CAN Decoder
        ↓
Incorrect scaling discovered
        ↓
Decoder corrected
        ↓
Raw retained CAN reprocessed
        ↓
Correct normalized telemetry
```

Historical corrections must be handled carefully and audibly where they affect business calculations.

---

# 48. Telemetry Deduplication

Providers may resend data.

The platform should prevent retransmission from causing:

```text
Duplicate fault events

Duplicate alerts

Duplicate operating-hour events

Duplicate location records where inappropriate
```

Deduplication may use:

```text
Provider message identifiers

Timestamps

Sequence numbers

Payload hashes

Provider-specific identifiers
```

depending on the provider.

---

# 49. Data Validation

Telemetry must be treated as external input.

Values should be checked for obvious invalid conditions.

Examples:

```text
batterySoc = 250%

Latitude outside valid range

Malformed CAN payload

Operating hours = negative

Impossible timestamp
```

The system should distinguish:

```text
Unavailable

Valid

Suspicious

Invalid
```

where useful.

---

# 50. Telemetry Quality

A signal may eventually carry a quality indicator.

Examples:

```text
GOOD

STALE

SUSPECT

INVALID

UNKNOWN
```

Quality may depend on:

```text
Source health

Signal age

Decoder validation

Provider status

Expected range
```

---

# 51. Device Connectivity State

Connectivity represents communication with the telemetry device/provider.

Possible states:

```text
ONLINE

OFFLINE

UNKNOWN
```

Connectivity may be calculated from:

```text
last_seen_at

expected reporting frequency

provider status

heartbeat information
```

Connectivity is not the same as machine activity.

---

# 52. Operational State

Machine operational state may include:

```text
ACTIVE

IDLE

CHARGING

UNKNOWN
```

The exact derivation depends on available machine signals.

Operational state is different from:

```text
Connectivity State

Rental State

Service State

Asset Lifecycle State
```

---

# 53. Telemetry Freshness

The UI must communicate how old a value is.

Example:

```text
Battery SOC:
74%

Updated:
30 seconds ago
```

versus:

```text
Battery SOC:
74%

Last known value:
2 days ago
```

Stale information must not visually appear live.

---

# 54. GPS Position

Location telemetry may contain:

```text
Latitude

Longitude

Speed

Heading

Altitude

Accuracy / satellite information
```

depending on provider capabilities.

The application must distinguish:

```text
Current / Recent Location
```

from:

```text
Last Known Location
```

---

# 55. Reverse Geocoding

GPS coordinates may be translated into human-readable addresses.

Example:

```text
39.93, 32.85
```

may become:

```text
Ankara, Türkiye
```

Reverse geocoding should be cached.

It should not automatically be executed for every single GPS record.

---

# 56. Location History

Authorized users may view historical machine location.

Possible uses include:

```text
Machine movement history

Delivery verification

Site history

Unauthorized movement investigation

Rental analysis
```

Location information must respect tenant and permission boundaries.

---

# 57. Geofencing

Future telemetry functionality may support geofences.

Examples:

```text
Branch Yard

Customer Site

Construction Site

Restricted Zone
```

Possible events include:

```text
ENTERED_GEOFENCE

LEFT_GEOFENCE
```

Example:

```text
Machine AWP-0042

left

ABC Construction Site

18:42
```

---

# 58. Operating Hours

Operating hours are a high-value signal.

They may be used by:

```text
Maintenance

Utilization

Finance

Machine Valuation

Service Planning
```

Where a machine provides an authoritative operating-hour counter, it should generally be preferred over estimated operating time.

The system must account for possible:

```text
Controller replacement

Counter reset

Device replacement

Invalid values
```

A sudden reduction must not silently overwrite trusted history.

---

# 59. Battery State of Charge

Battery SOC may be obtained from:

```text
Machine CAN

Battery BMS integration

OEM telemetry

Other telemetry provider
```

Battery SOC may support:

```text
Current state

Low battery warnings

Charging analysis

Fleet planning

Usage analysis
```

Source priority becomes especially important where several devices provide SOC.

---

# 60. Additional Battery Information

Future battery telemetry may include:

```text
Battery Voltage

Battery Current

Battery Temperature

Charge Cycles

State of Health

Energy Consumption

Charging Status
```

Availability depends on the machine and connected telemetry source.

---

# 61. Fault Information

Fault data may originate from:

```text
Custom CAN

J1939

OBD

OEM API

Provider diagnostics

Manual technician entry
```

Provider-specific fault information must be normalized before use by the business application.

---

# 62. Fault Definition

`FaultDefinition` describes what a fault means.

Example:

```text
Machine Model:
GALEN ES1012

Fault Code:
17

Description:
Platform overload sensor disagreement

Severity:
HIGH
```

A fault definition may eventually contain:

```text
Troubleshooting Instructions

Related Manual

Recommended Action

AI Knowledge References
```

---

# 63. Fault Event

`FaultEvent` represents an actual fault occurrence on a physical machine.

Possible information:

```text
machine_id

fault_definition

source

first_seen_at

last_seen_at

cleared_at

status

occurrence_count
```

The platform must avoid creating a new independent fault event every time the same still-active fault is reported.

---

# 64. Fault Clearing

When telemetry indicates a previously active fault is no longer present:

```text
FaultEvent.status
→ CLEARED
```

and:

```text
cleared_at
```

should be recorded.

The historical fault remains available.

---

# 65. Event-Based Telemetry

Not every telemetry item is a continuous measurement.

Events may include:

```text
Machine Activated

Machine Deactivated

Charging Started

Charging Stopped

Fault Appeared

Fault Cleared

Geofence Entered

Geofence Left

Device Rebooted

Command Acknowledged
```

Events may be stored separately from continuously sampled signals where appropriate.

---

# 66. Telemetry and Maintenance

Telemetry supplies measurements.

The Maintenance domain owns maintenance rules.

Example:

```text
Telemetry:

operatingHours = 480
```

Maintenance rule:

```text
Service Interval = 500 hours
```

Maintenance result:

```text
Maintenance Due In:
20 hours
```

The telemetry adapter itself must not contain maintenance policy.

---

# 67. Telemetry and Rental Operations

Telemetry may provide rental-operation insights.

Examples:

```text
Machine is still at customer site after rental end.

Machine has been offline for 24 hours.

Machine has barely operated during a long rental.

Machine moved outside expected worksite.
```

These may later produce warnings or reports.

Telemetry must not automatically change legal/commercial rental records without explicitly defined business rules.

---

# 68. Telemetry and Finance

Normalized telemetry may support metrics such as:

```text
Revenue per Operating Hour

Maintenance Cost per Operating Hour

Physical Utilization

Energy Cost

Idle Time
```

Telemetry provides measurements.

The Finance domain owns the financial calculations.

---

# 69. Rental Utilization vs Physical Utilization

These metrics must remain separate.

Example:

```text
Rental Duration:
30 days

Machine Operating Time:
18 hours
```

Commercial rental utilization and physical machine utilization measure different things.

Both may be valuable.

They must not be represented by one ambiguous `utilization` value.

---

# 70. Device Health

Telemetry-device health may include:

```text
Online / Offline

Last Seen

External Supply Voltage

Internal Battery

Signal Strength

GPS Availability

Firmware Version
```

where supported.

Device health is different from machine health.

Example:

```text
Tracking Device:
Healthy

Machine:
Critical Fault Active
```

is possible.

---

# 71. Provider Health

The platform should monitor provider-level integration health.

Examples:

```text
Ruptela ingestion running

Xtellio API available

Xtellio streaming delayed

Authentication failed

Provider rate limit reached

Unknown device received
```

Provider health belongs to the platform operations layer.

---

# 72. Failure Isolation

Failure of one telemetry provider must not unnecessarily affect another.

Example:

```text
Xtellio API unavailable
```

must not stop:

```text
Ruptela ingestion
```

Likewise, a telemetry outage must not prevent:

```text
Creating Rentals

Managing Customers

Completing Work Orders

Viewing Existing Financial Data
```

---

# 73. Unknown Devices

Telemetry received from an unknown provider device must not automatically be assigned to a tenant.

The system should:

```text
Reject

Quarantine

or Flag
```

unknown devices.

A device must be provisioned before normal tenant telemetry processing.

---

# 74. Machine Resolution

Incoming telemetry must conceptually resolve through:

```text
Provider Device Identity
        ↓
TrackingDevice
        ↓
DeviceInstallation
        ↓
Machine
        ↓
Organization
```

The installation valid at:

`recorded_at`

should normally determine which machine owns historical telemetry.

---

# 75. Tenant Isolation

Every telemetry record used by the business application must resolve to an organization.

Tenant A must never be able to access:

```text
Tenant B GPS

Tenant B telemetry

Tenant B faults

Tenant B device commands
```

Telemetry APIs are subject to the same tenant isolation rules as normal business data.

---

# 76. Telemetry API

Web and mobile applications must not directly access:

```text
Ruptela

Xtellio

Provider APIs

Telemetry Database

MQTT Broker
```

Normal application flow:

```text
Web / Mobile
      │
      ▼
Backend API
      │
      ▼
Telemetry Query Service
      │
      ▼
Current State / Telemetry History
```

---

# 77. Live Updates

The backend may send selected telemetry changes to clients using:

```text
WebSockets
```

Examples:

```text
Machine Online

Machine Offline

New Position

Battery SOC Updated

Fault Detected

Command Status Changed
```

The frontend does not need direct provider connections.

---

# 78. Internal Messaging

The platform may use:

```text
MQTT

Message Queue

Event Stream
```

internally if future scale justifies it.

For example:

```text
Ruptela
   ↓
Ruptela Adapter
   ↓
Normalized Telemetry
   ↓
Internal Event Stream
```

This is independent from whether the telemetry provider itself uses MQTT.

Internal distributed messaging is not mandatory for the initial release.

---

# 79. Remote Commands

Some devices may support remote actions.

Possible normalized command concepts include:

```text
IMMOBILIZE

ENABLE

REQUEST_STATUS
```

Provider support varies.

The business application must use normalized command types rather than provider command strings.

---

# 80. Command Capability

Remote command availability depends on several conditions.

Conceptually:

```text
Machine implementation supports action
        +
Tracking device supports action
        +
Provider integration supports action
        +
Organization feature enabled
        +
User has permission
        ↓
Command Available
```

Provider name alone is insufficient.

---

# 81. Device Command

A `DeviceCommand` represents a remote-action request.

Possible information:

```text
id

organization_id

machine_id

tracking_device_id

provider

command_type

requested_by

requested_at

sent_at

acknowledged_at

expires_at

status

failure_reason
```

---

# 82. Device Command States

Possible states include:

```text
REQUESTED

QUEUED

SENT

ACKNOWLEDGED

FAILED

EXPIRED
```

Additional provider-specific internal states may exist, but the business application should use normalized states where possible.

---

# 83. Requested Does Not Mean Executed

These are not equivalent:

```text
User clicked:
Immobilize
```

and:

```text
Machine confirmed:
Immobilization executed
```

The UI should first show:

```text
Command Requested
```

or:

```text
Waiting for Device Confirmation
```

The machine must not be shown as successfully immobilized purely because the request was created.

---

# 84. Command Expiration

Commands should support expiration.

Example:

```text
Immobilization requested:
Monday

Machine offline.

Machine reconnects:
Thursday
```

The platform must not blindly execute an old command unless that behavior was explicitly intended.

Commands should therefore support:

```text
expires_at
```

---

# 85. Command Idempotency

Repeated requests must not unintentionally create duplicate physical commands.

Example causes:

```text
Double click

Network retry

API retry

Provider timeout
```

Commands should use unique identifiers and idempotency mechanisms where necessary.

---

# 86. Remote Machine Safety

The cloud platform must never replace machine-side safety design.

A command such as:

```text
IMMOBILIZE
```

should mean:

> Request the machine's approved inhibit mechanism.

It must not blindly interrupt power in a way that may create hazardous behavior.

The physical machine/controller must determine when and how the inhibit function can safely be executed.

---

# 87. Command Audit

Sensitive commands must be fully auditable.

Audit information should include:

```text
User

Machine

Tracking Device

Provider

Command Type

Requested Time

Sent Time

Acknowledgement

Final Result

Failure Reason
```

---

# 88. Notifications From Telemetry

Telemetry may generate domain events that result in notifications.

Examples:

```text
Low Battery

Critical Fault

Machine Offline

Maintenance Due

Geofence Exit

Remote Command Failure
```

The telemetry layer provides the event.

The Notification domain determines:

```text
Who receives it

Which channel is used

Whether the notification is suppressed

Whether escalation is required
```

---

# 89. Telemetry Retention

Different telemetry data may require different retention periods.

Possible example:

```text
Raw Provider Payload
→ Short retention

Raw CAN
→ Short / medium retention

Normalized Telemetry
→ Longer retention

Aggregated Historical Analytics
→ Long retention
```

Exact retention periods will be defined later according to:

```text
Storage Cost

Customer Requirement

Debugging Value

Legal Requirement

Analytics Value
```

---

# 90. High-Frequency Data

High-frequency signals can create very large datasets.

The system may later use:

```text
Downsampling

Aggregation

Event-based storage

Compression

Signal-specific retention
```

The initial priority is correctness and traceability.

Optimization should be introduced based on actual volume.

---

# 91. Telemetry Query Ranges

Historical telemetry views should support useful ranges such as:

```text
24 Hours

7 Days

30 Days

Custom Range
```

Large queries should use appropriate aggregation.

The frontend should not request millions of raw points simply to draw a chart.

---

# 92. Telemetry Charts

Possible charts include:

```text
Battery SOC

Battery Temperature

Operating Hours

Energy Usage

Machine Activity

Speed

Idle Time
```

Charts consume normalized telemetry.

They must not contain provider-specific decoding logic.

---

# 93. Language and Telemetry

Internal telemetry identifiers remain language-independent.

Example:

```text
batterySoc
```

The UI may display:

```text
English:
Battery State of Charge

Turkish:
Batarya Doluluk Oranı
```

Similarly:

```text
OFFLINE
```

may become:

```text
English:
Offline

Turkish:
Çevrimdışı
```

Translated strings must never be used for telemetry logic.

---

# 94. Telemetry Security Boundary

All telemetry and provider data must be treated as untrusted external input.

The integration layer should validate:

```text
Device Identity

Payload Size

Packet Structure

API Response

CAN Length

Timestamp

Signal Range
```

Malformed telemetry must not compromise the wider application.

Detailed security rules are defined in:

`10-SECURITY.md`

---

# 95. Initial Telemetry Scope

The initial implementation should prioritize:

```text
Provider-independent telemetry architecture

TrackingDevice

DeviceInstallation

Multiple devices per machine

Multiple providers within one organization

Provider replacement

Ruptela proprietary protocol ingestion

Ruptela device identification

Ruptela configured CAN acquisition

Server-side CAN decoding

Versioned DecoderProfile

MachineDecoderAssignment

Xtellio adapter architecture

Xtellio API integration after official API specification review

Normalized telemetry

Source metadata

Telemetry capabilities

Signal source priority

GPS

Last Seen

Connectivity State

Operating Hours

Battery SOC where available

Machine Operational State

Fault processing

MachineCurrentState

Telemetry history

Provider health

Basic device health

Remote-command framework
```

Not every provider must support every capability in the first release.

---

# 96. Open Ruptela Integration Questions

The following Ruptela implementation details should be confirmed before production integration is considered complete.

```text
Exact representation of configured CAN data

CAN identifier format

11-bit CAN support

29-bit CAN support

Payload representation

Timestamp relationship to CAN data

Selected tracker hardware model

Server connection requirements

Device authentication method

Remote-command delivery

Remote-command acknowledgement

Device configuration process

Configuration update process

Firmware-management process
```

Already confirmed by Ruptela:

```text
GPS and CAN data are sent using Ruptela's proprietary protocol.

CAN data uses the Ruptela proprietary protocol whether the source
vehicle is supported or custom.

The device can capture custom CAN information from non-automotive
machinery.

The device sends only CAN information enabled in its configuration.

Custom firmware is not required simply to capture custom CAN data.
```

---

# 97. Open Xtellio Integration Questions

The Xtellio adapter must be finalized using the official Xtellio API documentation.

The following should be confirmed:

```text
Authentication method

Provider device identifiers

Device-list API

Telemetry / measurement API

GPS data structure

Operating-hour representation

Fault representation

Historical telemetry API

Streaming protocol

Streaming authentication

Timestamp semantics

Pagination

Rate limits

Data retention

Device health

Remote configuration

Remote commands

Subscription-dependent capabilities
```

Until the official API specification is reviewed, provider-specific payload structures must not be invented.

---

# 98. Future Telemetry Capabilities

Possible future developments include:

```text
Advanced geofencing

Battery State of Health

Charge-cycle analysis

Energy-consumption analysis

Idle-time analysis

Unauthorized movement detection

Predictive maintenance

Machine usage anomaly detection

CAN decoder management interface

Provider migration tools

Telemetry comparison tools

Remote device configuration

Firmware management

Fleet-wide device diagnostics

OEM integrations

Additional telemetry providers
```

These are future capabilities rather than first-release requirements.

---

# 99. Fundamental Telemetry Rules

The following rules are mandatory unless explicitly changed by a future architecture decision.

1. The telemetry architecture is provider-independent.

2. Ruptela is one provider integration, not the definition of the telemetry system.

3. Xtellio and other providers may operate simultaneously with Ruptela.

4. Different machines within one organization may use different providers.

5. A machine may have multiple active telemetry devices.

6. A physical device must not normally be actively installed on multiple machines simultaneously.

7. Changing telemetry provider must preserve historical data.

8. Provider-specific structures must stop at the provider-adapter boundary.

9. Business modules consume normalized telemetry.

10. Normalized telemetry must retain source metadata.

11. Multiple sources may provide the same signal.

12. Current-state source selection must use explicit source-resolution rules.

13. The most recently received signal is not automatically the authoritative signal.

14. Telemetry capabilities are determined by actual device and integration capability rather than provider name alone.

15. Machines and telemetry devices are separate entities.

16. Device installation history must be preserved.

17. Telemetry must resolve to the machine using the installation valid at `recorded_at`.

18. `recorded_at` and `received_at` are separate timestamps.

19. Delayed historical telemetry must not overwrite newer current state.

20. Missing telemetry must not be interpreted as zero.

21. Connectivity state and machine operational state are separate concepts.

22. Historical telemetry and current machine state are separate representations.

23. Ruptela protocol decoding and machine CAN decoding are separate responsibilities.

24. Custom CAN decoder profiles must be versioned.

25. Machine CAN protocol definitions must remain owned and version-controlled by the platform.

26. Ruptela CAN data must only be expected if that data was enabled in the device configuration.

27. Rental management must remain functional without telemetry.

28. Failure of one telemetry provider must not stop other providers.

29. Telemetry-provider failure must not disable core rental-management operations.

30. Remote command request and confirmed execution are different states.

31. Remote machine actions require explicit permission, capability checks, acknowledgement, and auditing.

32. Cloud commands must not replace machine-side safety logic.

33. Unknown devices must not automatically gain tenant access.

34. All telemetry access must respect tenant isolation.

35. Provider credentials and secrets must never be exposed to frontend clients.

---

# 100. Related Documentation

Project overview:

`01-PROJECT-OVERVIEW.md`

System architecture:

`02-SYSTEM-ARCHITECTURE.md`

Domain model:

`03-DOMAIN-MODEL.md`

UI / UX:

`04-UI-UX.md`

Authentication and permissions:

`05-AUTH-AND-PERMISSIONS.md`

Rental business rules:

`07-RENTAL-BUSINESS-RULES.md`

Maintenance:

`08-MAINTENANCE.md`

Finance and analytics:

`09-FINANCE-ANALYTICS.md`

Security:

`10-SECURITY.md`

Coding standards:

`11-CODING-STANDARDS.md`