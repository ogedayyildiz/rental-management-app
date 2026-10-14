# ADR-009: Treat Remote Machine Commands as Safety-Critical Asynchronous Operations

## Status

Accepted

## Context

The platform may eventually send commands such as:

```text
immobilize machine
enable machine
change device output
reset tracker
change device configuration
```

A cloud request is not the same as a physical action.

Commands may fail because:

- the device is offline;
- the cellular network is unavailable;
- the provider rejects the command;
- the command expires;
- the machine is in an unsafe state;
- the device acknowledges transport but the intended machine action does not occur.

For access equipment and industrial machinery, blindly interrupting power may itself create a safety hazard.

## Decision

Remote commands must be modeled as asynchronous stateful entities, not simple boolean toggles.

A command lifecycle should include states such as:

```text
REQUESTED
QUEUED
SENT
ACKNOWLEDGED
FAILED
EXPIRED
```

The exact provider-specific states may differ, but platform state must clearly distinguish:

```text
request created
message sent
provider/device acknowledged
physical safe state confirmed where supported
```

The UI must never claim:

```text
Machine Locked
```

solely because the user pressed a button.

## Safety Boundary

The cloud platform requests an action.

The machine/controller remains responsible for safe physical execution.

Remote immobilization must use an engineered machine-side safe inhibit mechanism.

The platform must not assume that it is safe to:

```text
cut the main contactor
remove power from active motion
disable safety circuits
```

at an arbitrary moment.

Actual implementation must respect machine design, controller logic, applicable standards, and provider/device capability.

## Command Requirements

Safety-sensitive commands require:

```text
explicit permission
capability check
unique command ID
idempotency
expiry
audit history
provider/device acknowledgement
clear failure state
```

Sensitive commands may also require:

```text
reason
confirmation
recent authentication
```

according to policy.

## Retry Behavior

Message-delivery retry is not automatically the same as retrying the physical action.

An expired command must not execute hours later merely because the device reconnects unless that behavior is intentionally defined.

## Reasons

This prevents:

- misleading UI;
- duplicate physical actions;
- stale commands executing later;
- unsafe assumptions about connectivity;
- accidental conflation of cloud intent with machine state.

## Consequences

Positive:

- safer remote control;
- clear auditability;
- better provider abstraction;
- resilient offline behavior.

Negative:

- remote control is more complex than a toggle;
- some providers may not offer strong acknowledgement semantics;
- machine integration may be required to confirm safe state.

## Reconsideration

Provider-specific command mechanisms may evolve, but the distinction between requested and executed action must remain.

## Related Documents

- `06-TELEMETRY-IOT.md`
- `10-SECURITY.md`
- `11-CODING-STANDARDS.md`
