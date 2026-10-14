# ADR-005: Allow Multiple Telemetry Sources per Machine and Resolve Signals Explicitly

## Status

Accepted

## Context

One machine may need more than one telemetry source.

Examples:

```text
Ruptela
→ GPS + custom CAN + remote output

OEM battery device
→ battery SOC + SOH + charging cycles
```

or a temporary provider migration:

```text
Ruptela
+
Xtellio
```

Both devices may report the same canonical signal, such as GPS or operating hours.

Using the value that arrived most recently is unsafe because:

- delayed packets may arrive later than newer data;
- one source may be stale or unhealthy;
- one source may be authoritative for one signal but not another;
- provider migration may intentionally overlap;
- data quality can differ between sources.

## Decision

A machine may have multiple active telemetry sources.

Every normalized measurement must retain source provenance, including where applicable:

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

When multiple sources provide the same canonical signal, the platform must use an explicit signal-source resolution policy.

Resolution may consider:

```text
configured source priority
freshness
device health
measurement quality
availability
```

Example:

```text
GPS:
Primary → Ruptela
Fallback → Xtellio

Battery SOC:
Primary → OEM Battery Device
Fallback → Ruptela
```

Historical telemetry may retain values from all sources.

`MachineCurrentState` should expose the resolved authoritative current value.

## Reasons

This supports:

- richer machine instrumentation;
- provider migration;
- provider fallback;
- OEM + aftermarket combinations;
- safer current-state calculation;
- traceable analytics.

## Consequences

Positive:

- no hard one-device-per-machine restriction;
- higher data quality and resilience;
- source changes are explicit;
- all original measurements can be preserved.

Negative:

- source-resolution logic adds complexity;
- UI may need to explain data source and quality;
- configuration requires sensible defaults.

## Rules

1. Never use “latest received wins” as the universal rule.
2. `recorded_at` and `received_at` are separate.
3. Delayed historical records must not overwrite a newer current state.
4. Provider name alone does not define authority.
5. Source selection may differ by canonical signal.
6. Current-state resolution must be deterministic and testable.

## Reconsideration

The resolution strategy may become more sophisticated, but support for multiple sources remains required.

## Related Documents

- `ADR-002-PROVIDER-INDEPENDENT-TELEMETRY.md`
- `ADR-004-DEVICE-INSTALLATION-HISTORY.md`
- `06-TELEMETRY-IOT.md`
- `11-CODING-STANDARDS.md`
