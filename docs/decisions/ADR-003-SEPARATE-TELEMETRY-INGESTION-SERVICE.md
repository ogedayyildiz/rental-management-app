# ADR-003: Deploy Telemetry Ingestion Separately from the Core Business API

## Status

Accepted

## Context

The normal business API primarily serves human-driven web and mobile requests over HTTPS. Telemetry ingestion serves machine-driven traffic with different technical characteristics.

Examples include:

```text
Business API:
- short-lived HTTPS requests;
- transactional workflows;
- moderate request frequency;
- users and mobile clients.

Telemetry Ingestion:
- device/provider connections;
- proprietary TCP and provider APIs;
- high write frequency;
- protocol parsing;
- device identification;
- delayed/offline records;
- acknowledgements;
- time-series processing.
```

Ruptela devices, for example, are configured to connect to our public telemetry endpoint and send Ruptela protocol packets directly to our infrastructure. This is fundamentally different from `GET /machines` or `POST /rentals`.

## Decision

Telemetry ingestion will be a separately deployable application/service from the core business API.

Conceptually:

```text
Web / Mobile
     ↓
Core Business API
     ↓
Business Modules


Ruptela / Xtellio / OEM / Future Provider
     ↓
Telemetry Ingestion
     ↓
Provider Adapter
     ↓
Normalized Telemetry
     ↓
Telemetry Storage / Current State / Domain Events
```

The telemetry service may live in the same monorepo and share approved packages, types, observability, and infrastructure libraries, but it must be deployable and scalable independently.

The public telemetry endpoint must be separate from the normal business API endpoint.

Example:

```text
api.example.com
→ HTTPS business API

telemetry.example.com
→ telemetry/provider ingestion endpoint
```

For Ruptela, the endpoint is a TCP-capable service implementing the documented proprietary protocol.

## Reasons

Separate deployment provides:

- independent scaling for telemetry traffic;
- isolation from long-lived device connections;
- independent failure handling;
- provider-specific networking;
- safer separation of machine-facing and human-facing trust boundaries;
- easier future use of specialized ingestion infrastructure.

## Consequences

Positive:

- telemetry spikes are less likely to degrade rental workflows;
- TCP/provider networking can evolve independently;
- operational monitoring is clearer;
- provider failures can be isolated.

Negative:

- deployment is more complex than a single process;
- some normalized events may need asynchronous handoff;
- shared business logic must be carefully limited to approved packages/interfaces.

## Communication with the Core Platform

The telemetry service should not directly implement rental or maintenance business rules.

It may:

- persist normalized telemetry;
- update telemetry-specific current-state projections;
- emit internal events;
- invoke defined application interfaces where required.

MQTT is not required for this architecture. If MQTT or another broker is later introduced internally, it is an optional messaging mechanism after provider data is received and normalized.

## Reconsideration

This boundary may evolve if scale or infrastructure requirements change, but telemetry should not be merged into the main HTTP API merely for convenience.

## Related Documents

- `ADR-001-MODULAR-MONOLITH.md`
- `ADR-002-PROVIDER-INDEPENDENT-TELEMETRY.md`
- `06-TELEMETRY-IOT.md`
- `10-SECURITY.md`
