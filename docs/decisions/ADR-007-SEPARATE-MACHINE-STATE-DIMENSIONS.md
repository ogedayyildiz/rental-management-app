# ADR-007: Keep Rental, Service, Connectivity, and Operational State Separate

## Status

Accepted

## Context

A machine has several independent realities.

For example:

```text
Rental:
RENTED

Service:
NORMAL

Connectivity:
OFFLINE

Operational:
UNKNOWN
```

or:

```text
Rental:
NOT_RENTED

Service:
MAINTENANCE_REQUIRED

Connectivity:
ONLINE

Operational:
STOPPED
```

Combining these into one status such as:

```text
AVAILABLE
IN_USE
BROKEN
OFFLINE
```

creates ambiguity and eventually leads to incorrect business logic.

A machine may be offline because the tracker has no cellular coverage while the machine itself is healthy. A machine may be returned from rental but still blocked for inspection. A machine may be rented but physically inactive for many hours.

## Decision

Model state as separate dimensions.

At minimum:

```text
Rental State
Service State
Connectivity State
Operational State
```

Other lifecycle dimensions may also exist, such as machine ownership/lifecycle state.

Examples:

```text
Rental State:
NOT_RENTED
RESERVED
RENTED

Service State:
NORMAL
MAINTENANCE_DUE
MAINTENANCE_REQUIRED
OUT_OF_SERVICE
SERVICE_BLOCKED

Connectivity State:
ONLINE
STALE
OFFLINE
UNKNOWN

Operational State:
ACTIVE
INACTIVE
UNKNOWN
```

Exact canonical values may evolve, but the dimensions must remain conceptually independent.

Overall availability is derived from relevant dimensions and scheduling information rather than stored as one universal status.

## Reasons

This avoids false assumptions such as:

```text
Offline = Broken
Returned = Available
Fault Cleared = Repaired
Machine Stopped = Rental Ended
```

It also provides clearer UI, analytics, and domain ownership.

## Consequences

Positive:

- more accurate business logic;
- easier analytics;
- fewer accidental cross-domain updates;
- clearer user explanations.

Negative:

- UI must present multiple states intelligently;
- availability calculation becomes more sophisticated;
- developers must avoid convenience fields that collapse the model.

## Rules

1. Telemetry connectivity does not change rental state.
2. Telemetry activity does not start or end rentals automatically.
3. Rental return does not automatically remove maintenance blocks.
4. Fault disappearance does not automatically change maintenance state.
5. Availability must be derived from lifecycle, rental/reservation, service, and other applicable restrictions.
6. Business modules may consume another domain's state but must not overwrite it directly.

## Reconsideration

This is a foundational domain decision and is not expected to be reversed.

## Related Documents

- `03-DOMAIN-MODEL.md`
- `06-TELEMETRY-IOT.md`
- `07-RENTAL-BUSINESS-RULES.md`
- `08-MAINTENANCE.md`
