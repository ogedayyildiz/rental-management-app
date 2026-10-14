# ADR-010: Use PostgreSQL with TimescaleDB for Core and Telemetry Data

## Status

Accepted

## Context

The platform needs both conventional relational business data and high-volume time-series telemetry.

Relational examples include:

```text
Organizations
Users
Memberships
Customers
Machines
Rentals
Work Orders
Financial Records
Device Installations
```

Time-series examples include:

```text
GPS positions
Operating hours
Battery SOC
Voltage
Machine activity
Fault measurements
Provider measurements
```

Using entirely separate database technologies from the beginning would increase operational complexity, backup complexity, data-access patterns, and developer overhead.

PostgreSQL is well suited to the transactional business model, while TimescaleDB extends PostgreSQL with time-series capabilities.

## Decision

Use PostgreSQL as the primary relational database and TimescaleDB for telemetry/time-series workloads.

TimescaleDB should be treated as part of the PostgreSQL data platform rather than as a replacement for the relational model.

Conceptually:

```text
PostgreSQL
├── Organizations
├── Machines
├── Rentals
├── Maintenance
├── Finance
└── Device Installations

TimescaleDB Hypertables
├── Normalized Telemetry
├── Measurements
├── Location History
└── Time-Series Events
```

Exact physical database separation may evolve with scale. The initial architecture may use the same PostgreSQL/TimescaleDB cluster where operationally appropriate.

## Reasons

This provides:

- strong relational transactions;
- SQL consistency;
- simpler developer tooling;
- shared backup and operations knowledge;
- efficient time-series queries;
- retention and aggregation capabilities;
- easier joins between machine identity and telemetry where appropriate.

## Current State vs History

Time-series storage is not the same as current machine state.

Historical telemetry belongs in time-series tables.

Frequently accessed current values should use a dedicated current-state/read model.

Conceptually:

```text
Telemetry History
→ TimescaleDB

MachineCurrentState
→ current resolved state projection
```

The platform must not repeatedly scan large telemetry history ranges merely to render the fleet list.

## Data Retention

Retention policies may differ by data class.

For example:

```text
high-frequency raw/provider data
→ shorter retention

normalized operational telemetry
→ longer retention

aggregates
→ potentially very long retention
```

Exact policies will be determined by customer requirements, cost, and analytics needs.

Historical business records such as rentals and maintenance must not be deleted merely because telemetry retention is reduced.

## Aggregation

TimescaleDB continuous aggregates or equivalent mechanisms may later support:

```text
hourly operating summaries
daily utilization
battery trends
location summaries
fleet-level analytics
```

Pre-aggregation is an optimization; authoritative business definitions remain in the application/domain layer.

## Consequences

Positive:

- fewer database technologies;
- strong SQL ecosystem;
- time-series capability without abandoning relational integrity;
- easier initial operations.

Negative:

- very large telemetry scale may eventually require dedicated clusters or additional streaming/storage systems;
- schema and indexing must be designed carefully;
- retention policies require active management.

## Reconsideration

Reconsider physical separation or additional technologies when telemetry scale, cost, retention, geographic distribution, or query requirements demonstrate a concrete need.

Possible future additions may include:

```text
object storage for raw archives
specialized analytics warehouse
streaming platform
separate Timescale cluster
```

These should be introduced only when justified.

## Related Documents

- `02-SYSTEM-ARCHITECTURE.md`
- `03-DOMAIN-MODEL.md`
- `06-TELEMETRY-IOT.md`
- `09-FINANCE-ANALYTICS.md`
- `11-CODING-STANDARDS.md`
