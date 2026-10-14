# ADR-002: Keep the Core Platform Independent of Telemetry Providers

## Status

Accepted

## Context

The platform must support multiple telemetry providers over its lifetime. The initial providers include Ruptela and Xtellio, but customers may already have different hardware or may replace providers later.

These providers expose data differently:

- Ruptela devices send data using Ruptela's proprietary device-to-server protocol to our telemetry ingestion infrastructure.
- Xtellio is treated as a cloud/API or streaming provider whose exact payloads and capabilities are accessed through Xtellio's integration interfaces.
- Future OEM or third-party integrations may use REST, streaming APIs, MQTT, webhooks, proprietary TCP, or other transports.

If provider-specific fields, protocol identifiers, or payload formats leak into rentals, maintenance, finance, or machine business logic, replacing or adding a provider would require widespread changes throughout the application.

## Decision

All telemetry providers must be isolated behind provider adapters.

Conceptually:

```text
Provider Device / Cloud
        ↓
Provider Adapter
        ↓
Normalized Telemetry
        ↓
Machine / Maintenance / Rental / Finance
```

The provider adapter is responsible for converting provider-specific transport and payload structures into platform-defined normalized telemetry.

Core business modules must consume canonical platform concepts such as:

```text
location
operating_hours
battery_soc
battery_voltage
fault
machine_active
device_connectivity
```

rather than fields such as:

```text
Ruptela FMIO 123
Xtellio parameter ABC
Provider-specific JSON keys
```

Provider credentials, payload structures, protocol details, endpoints, retry behavior, and device identifiers must remain inside the integration boundary.

Provider capability must be modeled explicitly. The platform must not assume that every provider or every device supports the same features.

Possible capabilities include:

```text
GPS
OPERATING_HOURS
BATTERY_SOC
FAULTS
CUSTOM_CAN
RAW_OR_CONFIGURED_CAN
REMOTE_CONTROL
STREAMING
```

UI and backend workflows must use actual capabilities rather than provider-name assumptions.

## Reasons

This decision allows:

- different customers to use different providers;
- one fleet to contain multiple providers;
- providers to be replaced without rewriting business modules;
- telemetry providers to fail independently;
- provider-specific protocols to evolve without changing rental or maintenance logic;
- the platform itself to remain the primary product rather than becoming a Ruptela- or Xtellio-specific application.

## Consequences

Positive:

- lower vendor lock-in;
- clearer architecture;
- easier provider replacement;
- easier testing;
- business logic remains stable.

Negative:

- adapters require implementation and maintenance;
- normalized models may not expose every provider-specific feature directly;
- provider-specific advanced features may require capability extensions.

## Rules

1. No provider payload type may become a core domain type.
2. Provider credentials must never reach frontend applications.
3. Provider-specific identifiers may be stored for integration purposes, but they must not replace platform entity IDs.
4. Unknown provider data should be retained or rejected safely rather than silently mapped incorrectly.
5. Adding a provider should primarily require a new adapter, configuration, and capability mapping rather than changes across business domains.

## Reconsideration

This decision should only be reconsidered if the product intentionally becomes dependent on one provider as a strategic product constraint, which is not the current goal.

## Related Documents

- `02-SYSTEM-ARCHITECTURE.md`
- `03-DOMAIN-MODEL.md`
- `06-TELEMETRY-IOT.md`
- `10-SECURITY.md`
- `11-CODING-STANDARDS.md`
