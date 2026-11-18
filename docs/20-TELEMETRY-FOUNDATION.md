# Telemetry foundation: device registry and installation history

The original persistence slice is the basis for the Phase 1 administration API below.
A TrackingDevice belongs to one organization even when it has no installation. Its UUID
identifies the registered unit. Provider and external identifier are opaque inventory
fields; their pair is unique within that tenant. An identifier by itself does not prove
device identity, establish a tenant, or grant access. Do not resolve an incoming packet
to a tenant by searching for an arbitrary matching identifier.

DeviceInstallation links the device and Machine through organization-scoped composite
foreign keys. Intervals include installedAt and exclude removedAt (UTC); a null end is
open. PostgreSQL btree_gist and an exclusion constraint enforce non-overlap across all
intervals of one device, including concurrent writes and backdated installations.
Different devices may be installed on a machine simultaneously. Move a device by closing
the current interval and inserting a new row in one transaction. History rows cannot be
deleted, rewritten or reopened through ordinary DML.

The internal resolveDeviceInstallation lookup requires a trusted organization, registered
device UUID and recordedAt. It returns null before installation, during a gap, or for an
unknown or foreign device. It does not use receipt time or modify any Machine state.
Phase 1 adds the authenticated administration and internal ingestion paths below. Future providers must authenticate their own source/tenant context independently.

See ADR-002 through ADR-006 and the [telemetry architecture](06-TELEMETRY-IOT.md).
The disposable PostgreSQL integration suite exercises concurrent installs, multiple
devices per machine, movement boundaries, historical overlap and cross-tenant substitution.

## Phase 1: administration

Under /organizations/:organizationId, GET /devices lists up to 100 scoped devices
(after an optional UUID cursor); GET /devices/:id includes machine and interval history.
POST /devices registers inventory. PATCH /devices/:id changes model, serial or a
per-signal priority map (0–100, higher preferred); tenant and external identity stay fixed.
POST /devices/:id/install and /move take a machineId. POST /devices/:id/remove closes
the open interval. Move closes and opens at the same server timestamp. All writes
revalidate membership and permission, and audit inside the same serializable transaction.

Permissions: device.read, device.manage, device.assign, device.remove, telemetry.read,
fault.read. Move requires both assign and remove. Existing administration-template roles
receive audited tenant grants. There is no implicit platform grant. Only all-branch users
may register or manage uninstalled inventory; selected-branch users see devices on
permitted machines and only history rows for accessible machines. Both ends of a move
must be in scope. Registration does not grant a device network access.

## Ingestion, time and evidence

The ingestion application in apps/telemetry accepts a trusted adapter binding separately
from untrusted observations. The binding identifies a provisioned tenant/provider account
context and external device ID. The same external ID in two tenants is safe. Strict fixture
contracts reject payload tenant/machine IDs, invalid coordinates/ranges, unknown fields,
oversize data and future recordings. No unauthenticated HTTP ingestion route exists.

Inside one PostgreSQL transaction the pipeline serializes writes per device, resolves
the installation at recordedAt, records a SHA-256 payload fingerprint, event identity and
server receipt time, then writes normalized measurements to a Timescale hypertable.
Raw credentials or packet bodies are not retained. Repeating a device/event ID with the
same bytes is idempotent; reuse with different evidence is rejected. Missing measurements
remain absent. Numeric readings carry canonical units (km/h, km, hours, %, V, °C, rpm);
location is one pair to prevent mixing latitude and longitude from different sources.

Current reads use compact per-installation contact and latest-per-signal projections.
Recorded time orders observations; source event ID breaks equal-time ties. Per signal,
prefer fresh installed sources, then installed sources, health, configured priority,
quality, newest recording, and stable IDs. A closed installation can only supply a
last-known value. Connectivity is UNKNOWN without evidence; ONLINE requires a fresh
recording from a currently installed device, otherwise OFFLINE. TELEMETRY_FRESH_SECONDS
defaults to 300. Delayed delivery alone cannot make historical data appear live. This
policy never changes rental, service or lifecycle state.

Fault observations are separate from measurements. Only an explicit clear closes a fault;
an omitted code does not. Current per-installation/code state carries first/last seen,
severity and occurrence count. Late observations are evaluated in recorded order.
The ingestion result exposes a committed FaultChange for a future consumer, without
creating maintenance work orders. No production delivery queue is implied.

## API, UI and simulator

GET /machines/:id/telemetry returns scoped connectivity, last update, resolved readings
with provenance/freshness and, with fault.read, active faults. GET /machines/:id/telemetry/history
requires UTC from/to and comma-separated signals. Range is half-open, at most 31 days;
the default maximum is 500 observations (request limit 1–2000). No raw download.
The Devices page registers and assigns inventory; Machine detail refreshes current state
and renders the last known position with MapLibre. Its default country-outline map,
worker and attribution assets are local. Coordinates do not require a third-party
tile service. A deployment may set NEXT_PUBLIC_MAP_STYLE_URL for an approved map style.

For a local smoke test register a device with provider **simulator**, install it using
the Devices page, then build the service and run:

    pnpm --filter @rental/telemetry-service build
    pnpm --filter @rental/telemetry-service simulate <organization-uuid> <registered-external-id> <UTC-instant> drive

Use a recording time after installation and no later than now. drive / discharge / charge
provide GPS movement, speed, operating hours, distance, battery/charging, canonical CAN
motor rpm and a fault that appears, persists, then clears. Use successive instants.
duplicate replays identical evidence; late subtracts a second, stale subtracts a day
(choose a device already installed then), malformed exercises rejection. The operator
supplies trusted simulator configuration; the generated frame contains neither tenant
nor machine ID. This CLI only accepts local PostgreSQL outside production. Automated
browser tests call the same ingestion application against the disposable fixture database.

## External verification boundaries

**REAL PROVIDER VERIFICATION — BLOCKED PENDING HARDWARE / PROVIDER ACCESS**

No physical telemetry hardware or real provider connection is currently available.
Still pending: a real Ruptela device connection, official Ruptela protocol verification
against representative packets, real Xtellio cloud/API access, representative provider
data, and production public ingress validation. Existing provider interfaces and the
simulator remain the development boundary. Do not add speculative packet decoders or
claim fixture tests verify either provider. Remote commands and immobilization remain
deferred.

Synthetic canonical fixtures exercise the adapter contract only. Ruptela retains a
proprietary device-to-server TCP boundary; Xtellio retains a configured cloud/account
boundary. Neither has live decoding or credential verification in this phase. Real packet
specifications, credentials and hardware/cloud testing, and production ingress deployment
remain external. No remote command, geofence, automatic work order, or finance action.

## Verification (2026-11-13)

Verified locally: both additive migrations deployed to the development database without
a reset; 111 unit/integration tests and 19 Playwright scenarios passed. The original
17 scenarios also passed independently before development migration. The two new
browser scenarios exercise simulator → ingestion → TimescaleDB → authenticated current
and historical API → Machine detail, including a loaded MapLibre map, multi-source
battery selection, fault appearance/clear, offline display, device installation/movement
and tenant/branch denial. Lint, strict TypeScript, formatting and full build passed.
Simulated events and device registrations used disposable databases only.

Not verified at that date: real Ruptela hardware/protocol, real Xtellio cloud/API,
production ingress deployment, or hosted CI execution. The canonical fixture adapters
are not vendor decoders.

Hosted CI subsequently passed on 2026-11-18: 111 unit/integration tests, 19 Playwright
scenarios, lint, strict TypeScript, formatting and full build. See
[the hosted verification record](19-E2E-TESTING.md#hosted-verification-2026-11-18).
Real-provider and production-ingress verification remain blocked by the access gate above.
