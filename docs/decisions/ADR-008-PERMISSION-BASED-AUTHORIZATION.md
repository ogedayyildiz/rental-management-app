# ADR-008: Authorize by Permissions, Not by Fixed Role Names

## Status

Accepted

## Context

Different rental companies organize responsibilities differently.

One organization may use:

```text
General Manager
Rental Manager
Service Manager
Technician
```

while another may use:

```text
Operations Manager
Workshop Supervisor
Branch Manager
```

A fixed rule such as:

```text
if role == "Service Manager"
```

would make the product rigid and force every customer into our organizational structure.

Platform administrators also have responsibilities that are fundamentally different from tenant users.

## Decision

Authorization must be permission-based.

Roles are configurable collections of permissions.

Example permissions:

```text
rentals.create
rentals.reserve
rentals.assign_machine
maintenance.complete
maintenance.block_machine
finance.profitability.view
machine.remote_control
roles.manage
```

Default tenant roles may be provided as templates, but they are not mandatory hard-coded authorization identities.

Authorized tenant administrators may:

- enable or disable default role templates;
- rename tenant roles;
- create custom roles;
- modify allowed tenant-role permissions;
- assign roles to memberships.

Backend authorization checks must evaluate permissions rather than display role names.

Platform-level roles and permissions must remain separate from tenant memberships.

## Reasons

This supports:

- different company structures;
- future enterprise customers;
- least-privilege access;
- financial separation;
- custom operations roles;
- flexible onboarding.

## Consequences

Positive:

- customers can match software access to real responsibilities;
- business logic remains independent of organization naming;
- permissions can be tested consistently.

Negative:

- role-management UI is more complex;
- permission taxonomy must remain controlled;
- dangerous combinations require safeguards.

## Safety Rules

The system should prevent situations such as:

- disabling a role while it is still assigned without a safe migration;
- removing all tenant administration capability;
- allowing tenant administrators to modify platform-level roles;
- silently granting finance or remote-control permissions.

Sensitive permissions may require additional confirmation or policy.

## Backend Rule

Frontend role checks are for presentation only.

The backend must enforce permissions for every protected action.

Bad:

```text
if user.role === "Service Manager"
```

Preferred:

```text
requirePermission("maintenance.complete")
```

## Reconsideration

Default role templates may evolve, but permission-based authorization remains the required model.

## Related Documents

- `05-AUTH-AND-PERMISSIONS.md`
- `10-SECURITY.md`
- `11-CODING-STANDARDS.md`
