# ADR-004: Model Device-to-Machine Relationships with Installation History

## Status

Accepted

## Context

A tracking device is not permanently identical to a machine.

During the lifetime of the platform:

- a tracker may be installed on one machine and later moved to another;
- a machine may change telemetry provider;
- a failed tracker may be replaced;
- a machine may temporarily have multiple trackers during migration or testing;
- historical telemetry must still be attributable to the correct machine at the time it was recorded.

A field such as:

```text
machine.device_id
```

cannot preserve this history and encourages the false assumption that one machine always has exactly one permanent tracking device.

## Decision

Represent the relationship through a historical `DeviceInstallation` entity.

Conceptually:

```text
TrackingDevice
      ↓
DeviceInstallation
      ↓
Machine
```

A DeviceInstallation should preserve at least:

```text
machine_id
tracking_device_id
installed_at
removed_at
```

and may later include:

```text
installed_by
removed_by
notes
installation_location
purpose
```

A machine may have zero, one, or multiple active DeviceInstallations.

A physical tracking device should normally have at most one active machine installation at a time.

Historical telemetry must resolve the device to the machine using the installation that was active at the telemetry `recorded_at` time, not merely the device's current installation.

## Reasons

This supports:

- device replacement;
- provider migration;
- temporary overlap;
- reliable historical telemetry;
- second-hand machine history;
- auditability;
- multi-device configurations.

## Example

```text
Device RUP-001
Installed on Machine A:
2026-01-01 → 2027-03-10

Device RUP-001
Installed on Machine B:
2027-03-11 → present
```

A telemetry record from February 2027 belongs to Machine A even if it is received or reprocessed after the device has moved to Machine B.

## Consequences

Positive:

- historical relationships are preserved;
- device changes do not damage machine history;
- provider migrations are supported naturally;
- machine and device lifecycles remain separate.

Negative:

- telemetry resolution is more complex;
- active-installation uniqueness constraints must be enforced carefully;
- historical queries must consider time.

## Rules

1. Do not use `machine.device_id` as the authoritative relationship.
2. Do not overwrite an old installation when a device moves.
3. Closing an installation sets `removed_at`; it does not delete history.
4. Telemetry machine resolution must use installation time boundaries.
5. Unknown or ambiguous installations must fail safely and must not assign telemetry to an arbitrary tenant.

## Reconsideration

This decision is foundational and should only change if the product no longer supports historical device movement, which is not expected.

## Related Documents

- `03-DOMAIN-MODEL.md`
- `06-TELEMETRY-IOT.md`
- `10-SECURITY.md`
- `11-CODING-STANDARDS.md`
