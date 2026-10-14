# ADR-001: Use a Modular Monolith for Core Business Logic

## Status

Accepted

---

## Context

The platform combines several closely related business domains, including:

- organizations and users;
- customers;
- machines;
- rentals and reservations;
- maintenance;
- finance and analytics;
- documents;
- notifications;
- audit history.

These domains interact frequently.

Examples include:

```text
Rental
  ↓
Machine Assignment
  ↓
Availability
  ↓
Maintenance Block
  ↓
Financial Attribution
```

and:

```text
Telemetry Fault
  ↓
Maintenance Work Order
  ↓
Machine Service State
  ↓
Rental Availability
```

A microservice architecture could separate these domains into independently deployed services.

However, doing so from the beginning would introduce significant distributed-system complexity before there is a demonstrated operational need for it.

Examples of additional complexity include:

- network communication between business domains;
- distributed transactions;
- eventual consistency;
- message queues;
- idempotency across services;
- failure handling;
- retry behavior;
- service discovery;
- distributed tracing;
- deployment coordination;
- schema and API versioning;
- operational monitoring of many services;
- more complex local development.

The early product will be developed by a relatively small team and should prioritize implementation speed, correctness, and clarity while preserving the ability to scale later.

Telemetry ingestion is a special case because its workload differs significantly from normal business application traffic. It handles long-lived device connections, provider-specific protocols, high-frequency data, and potentially much greater write volume.

---

## Decision

The core business backend will initially be implemented as a **modular monolith**.

The main business domains will run within one deployable backend application while maintaining explicit internal module boundaries.

Conceptually:

```text
Core Backend Application

├── Organizations
├── Users / Memberships
├── Customers
├── Machines
├── Rentals
├── Maintenance
├── Finance
├── Documents
├── Notifications
└── Audit
```

These modules may share the same application process and primary PostgreSQL database while maintaining clear ownership of business logic and data responsibilities.

Modules must interact through defined interfaces rather than directly depending on each other's internal implementation details.

Telemetry ingestion will remain separately deployable from the core backend because its technical requirements are sufficiently different.

Conceptually:

```text
Web / Mobile
      ↓
Core Business API
      ↓
Modular Business Domains


Telemetry Providers / Devices
      ↓
Telemetry Ingestion Service
      ↓
Normalized Telemetry
      ↓
Core Platform / Storage
```

The architecture must remain **microservice-ready**, meaning module boundaries should be designed so that a module can later be extracted into an independent service if justified.

This does not mean implementing distributed-service infrastructure before it is needed.

---

## Reasons

### 1. Strong Transactional Consistency

Many core business operations require several related changes to succeed or fail together.

Example:

```text
Assign Machine to Rental
      ↓
Create Assignment
      ↓
Validate Availability
      ↓
Update Rental State
      ↓
Create Audit Event
```

A modular monolith allows these operations to use normal database transactions.

With independent microservices, the same workflow could require distributed coordination, retries, compensating actions, or saga patterns.

---

### 2. Lower Initial Complexity

The first production version should focus engineering effort on:

- correct rental workflows;
- maintenance logic;
- telemetry integration;
- financial calculations;
- tenant isolation;
- permissions;
- mobile and web interfaces.

The project should not spend unnecessary effort operating many independently deployed services before there is a clear need.

---

### 3. Easier Development and Debugging

A coherent core backend is easier to:

- run locally;
- test;
- debug;
- trace;
- refactor;
- understand.

This is especially valuable while the domain model is still evolving.

It also reduces cognitive overhead for developers and AI coding agents working across related business rules.

---

### 4. Easier Domain Evolution

The exact boundaries between rental, maintenance, machines, finance, and availability will evolve as the product is tested with real rental companies.

Keeping these domains in a modular monolith makes boundary adjustments less costly than changing distributed service contracts during early development.

---

### 5. Avoid Premature Distributed Systems

Microservices solve real problems when independent scaling, deployment, ownership, security, or technology requirements justify them.

They should not be used merely because they may become useful later.

The architecture should avoid paying distributed-system costs before those benefits exist.

---

### 6. Preserve Future Extraction

A modular monolith does not mean tightly coupled code.

Each domain must have:

- clear ownership;
- explicit public interfaces;
- controlled dependencies;
- its own application/domain logic;
- minimal knowledge of other modules' internals.

This makes future service extraction substantially easier.

---

### 7. Telemetry Is Already a Natural Service Boundary

Telemetry ingestion has different characteristics from ordinary business APIs:

```text
Business API:
Human-driven requests
REST / HTTPS
Moderate request frequency
Transactional workflows

Telemetry:
Machine-driven traffic
Persistent or provider-specific connections
High write frequency
Protocol decoding
Time-series workloads
```

Because of this difference, telemetry ingestion should be independently deployable from the beginning.

This is an intentional exception, not a signal that every domain should become a separate service.

---

## Module Boundary Rules

The modular monolith must not become an unstructured monolith.

The following rules apply:

1. Each business domain should have a clearly defined module.
2. Modules should expose explicit interfaces or application services.
3. One module should not directly modify another module's internal database state.
4. Cross-domain workflows should use defined application-level interfaces.
5. Shared utilities must not become a place for domain logic from unrelated modules.
6. Circular dependencies should be avoided.
7. Business rules belong inside the module that owns the concept.
8. Frontend applications must not bypass backend domain boundaries.
9. Provider-specific telemetry logic must remain outside core business modules.
10. Important module boundaries should be covered by automated tests where practical.

---

## Example

A rental extension needs to know whether a machine can remain assigned.

The rental module should not directly inspect arbitrary maintenance tables.

Preferred conceptual interaction:

```text
Rental Module
      ↓
Availability / Maintenance Interface
      ↓
Maintenance Module
```

The maintenance module answers whether blocking technical restrictions exist.

Similarly, finance should consume rental and maintenance outcomes through defined domain interfaces rather than directly reproducing their business rules.

---

## Consequences

### Positive

The decision provides:

- simpler deployment;
- easier local development;
- simpler transactions;
- easier debugging;
- lower infrastructure complexity;
- faster early product development;
- easier domain refactoring;
- strong consistency for business workflows;
- fewer distributed failure modes;
- a clearer environment for AI-assisted development.

### Negative

The core backend cannot independently scale each domain from the beginning.

A poorly maintained modular monolith could gradually become tightly coupled.

The shared process creates some shared failure risk.

Database ownership boundaries require discipline because several modules may use the same physical database.

Future extraction into services may require additional work.

These disadvantages are accepted in exchange for lower early-stage complexity.

---

## Future Reconsideration

A module may be considered for extraction into an independent service when one or more of the following become true:

- it requires substantially different scaling;
- it requires independent deployment frequency;
- it has a distinct availability requirement;
- it has a meaningful security-isolation requirement;
- it requires a different technology stack;
- it has a clear independent team ownership boundary;
- its workload negatively impacts the core backend;
- its data and transactional boundaries are sufficiently stable;
- operating it separately provides measurable business or technical benefit.

Examples of possible future service candidates may include:

```text
Telemetry Processing

Notifications

Document Processing

Reporting / Analytics

AI Services
```

but none should be extracted merely because they appear on this list.

---

## Rejected Alternative: Microservices From Day One

The project will not initially create separate services such as:

```text
Rental Service

Machine Service

Maintenance Service

Finance Service

Customer Service

User Service
```

with network APIs between each domain.

The primary reasons are:

- unnecessary operational overhead;
- distributed transaction complexity;
- slower development;
- more difficult testing;
- premature service contracts;
- increased failure modes;
- limited benefit at the project's current scale.

---

## Rejected Alternative: Unstructured Monolith

The project will also not use a single backend with no meaningful internal boundaries.

That approach would make future evolution and service extraction difficult.

The chosen architecture is therefore:

```text
Modular Monolith
+
Strong Domain Boundaries
+
Separately Deployable Telemetry Ingestion
+
Future Service Extraction When Justified
```

---

## Related Documents

```text
02-SYSTEM-ARCHITECTURE.md
03-DOMAIN-MODEL.md
06-TELEMETRY-IOT.md
11-CODING-STANDARDS.md
```

Related future ADRs:

```text
ADR-002-PROVIDER-INDEPENDENT-TELEMETRY.md
ADR-003-SEPARATE-TELEMETRY-INGESTION-SERVICE.md
```
