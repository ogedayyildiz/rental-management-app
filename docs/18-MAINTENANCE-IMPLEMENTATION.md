# Maintenance / service implementation

## Scope and terminology

This module implements `WorkOrder`, `MaintenancePlan`, `MachineMaintenancePlan`,
checklists, material usage, permission-protected costs and technical restrictions
inside the NestJS modular monolith. It follows the names in the Domain Model and
Maintenance document. No new service, queue or authoritative database is introduced.
See [Maintenance](08-MAINTENANCE.md), [Machine implementation](16-MACHINE-IMPLEMENTATION.md),
[Rental implementation](17-RENTAL-IMPLEMENTATION.md), ADR-007 and ADR-008.

The owner approved `maintenance.costs.view` and `maintenance.costs.edit` and moving
technical block/release actions to Maintenance. Calendar-only scheduling is the
explicit scope of this phase; broader usage-based requirements remain future work.

## Aggregate and persistence

`WorkOrder` references an immutable same-tenant Machine UUID, a responsible Branch,
optional assigned active Membership, and optionally a MachineMaintenancePlan.
Internal UUIDs and tenant/year display numbers (`WO-2026-000001`) are separate.
Counter allocation uses the organization's timezone for the year and the existing
organization scheduling lock in a Serializable transaction; concurrent conflicts
return 409 without duplicate numbers. Clients refresh before retrying.

The record preserves reported description separately from diagnosis, technician
notes and completion notes. Types are PREVENTIVE, CORRECTIVE, INSPECTION and OTHER.
Priority (LOW/NORMAL/HIGH/URGENT) is separate from operational impact. Planned start,
planned end, due, actual start/completion/cancellation and creation/update timestamps
are UTC instants, displayed in the tenant timezone. Actual start/completion are
server timestamps in this initial workflow. No Customer or telemetry identity is
required. Creator/updater attribution and all histories remain attached to Machine.

Organization-scoped composite FKs protect Machine, Branch, assigned Membership,
plan assignment and work-order children. Decimal material quantities must be
positive; monetary amounts are nonnegative NUMERIC(30,6) plus explicit currency.
No JavaScript floating-point monetary calculation is performed. Checklist items
retain completion time/user and notes; material/cost rows are append-only in this
phase. Final work orders cannot be silently edited or reopened.

## Workflow

`DRAFT -> OPEN -> PLANNED -> IN_PROGRESS -> COMPLETED` follows the documented terms.
OPEN can start directly without scheduling. DRAFT/OPEN/PLANNED/IN_PROGRESS can be
cancelled with a reason. WAITING and controlled historical amendments are deferred.

- Create a draft, then explicitly accept/open it.
- Schedule requires a valid planned start/end period. Planned edits cannot clear it.
- Start requires an ACTIVE-lifecycle machine that is not RENTED. Return/replace the
  machine through Rental before workshop work; this phase does not add field service.
- Completion requires completion notes and all checklist tasks completed.
- Repeating the same final transition is a no-op, without duplicate transition audits.
- Operational fields are editable before start; only diagnosis/technician notes can
  be patched while IN_PROGRESS. Checklist/material/cost operations remain available
  while open, under their own permissions. Final records remain readable.

## Service-state ownership and restrictions

Maintenance is the writer of technical restriction changes. Generic Machine create
starts NORMAL; generic Machine PATCH cannot change serviceState (an unchanged value
is tolerated for existing clients). The Machine editor displays this state read-only.

The additive migration preserves every existing non-NORMAL Machine serviceState as
an independent ServiceRestriction and records a SYSTEM audit. It does not infer that
old technical issues have been resolved. Authorized maintenance users release those
restrictions explicitly with a reason.

Each open work order owns its own restriction. The current projection takes the
strongest unreleased restriction in this order:

`NORMAL < MAINTENANCE_DUE < MAINTENANCE_REQUIRED < OUT_OF_SERVICE < SERVICE_BLOCKED`.

- DRAFT has no work-order restriction.
- INFORMATIONAL open/planned work does not change current service state.
- WARNING open/planned work projects MAINTENANCE_DUE, a non-blocking advisory that
  accepted work is outstanding; it is distinct from the timestamp-based overdue flag.
- RENTAL_BLOCKING open/planned work projects MAINTENANCE_REQUIRED.
- SAFETY_CRITICAL projects SERVICE_BLOCKED.
- IN_PROGRESS projects OUT_OF_SERVICE, or SERVICE_BLOCKED for safety-critical work.
- Complete/cancel releases only that work order's restriction, then recalculates all
  remaining sources. Manual restrictions and other work orders survive.

Manual restrictions require maintenance.block_machine; release requires
maintenance.release_machine and a reason. Work-order restrictions cannot be released
through the manual endpoint. Transitions that impose a block or release an existing
work-order restriction also require the corresponding permission. Status, impact and
priority are not interchangeable. All projection changes are transactionally audited.

## Rental coordination

Maintenance never writes Machine.rentalState or ends/moves a rental. Problems may be
reported while a machine is rented; blocking further dispatch is allowed, but starting
workshop maintenance while RENTED is rejected. Serious technical findings remain
recordable even if they affect existing commercial commitments.

A PLANNED workshop period occupies the machine for its end-exclusive [start,end)
interval, independently of current service impact. Rental's existing capacity matcher
consumes those periods from the database adapter alongside physical assignments and
unallocated category/model demand. There is no copied rental schedule. Scheduling or
editing a planned work order rechecks conflicts using the same organization lock and
Serializable transaction used by Rental. Cancelling/completing releases that planned
period; current unresolved restrictions still control dispatch eligibility.

## Plans, recurrence and overdue

Reusable plans have type, description, checklist, explicit operational impact,
positive interval, DAYS/MONTHS unit and COMPLETION/SCHEDULED interval basis.
MachineMaintenancePlan supplies an explicit nextDueAt and active flag. The UI can
assign a plan and explicitly create a draft from it; no automatic generation or
notification worker is introduced. A partial unique index prevents multiple open
work orders for the same machine-plan assignment.

The plan and original scheduled due timestamp are snapshotted into the created work
order. Later plan edits do not change that work order's recurrence calculation.
Completing it advances nextDueAt once from either actual completion or the snapshotted
scheduled due date. Calendar arithmetic uses UTC calendar days/months; month-end dates
clamp to the last valid day. The tenant timezone is used for display. No 24-hour rental
billing assumption is introduced. A late SCHEDULED-basis service can leave the next
occurrence overdue; the system does not silently skip maintenance occurrences.

Inactive plans or machine assignments reject new work-order generation and stop future
recurrence advancement. Existing linked work orders remain completable and historical;
completion does not reactivate the plan. Completion-based recurrence uses the exact
recorded completion timestamp. The plan UI loads choices automatically, supports editing
and activation/deactivation, and refreshes next due after work-order completion.

An unfinished work order is overdue when dueAt is before server now. Null due dates
are not overdue; COMPLETED/CANCELLED records are excluded. Filtering is server-side.
Overdue alone does not escalate a WARNING into a safety block. Usage-based scheduling,
manual hour readings and normalized telemetry triggers are deferred; future adapters
must call Maintenance application services, never write its tables directly.

## Authorization and branch scope

Permissions: maintenance.read/create/update/schedule/start/complete/cancel,
maintenance.block_machine/release_machine, maintenance.plans.manage,
maintenance.costs.view/edit and maintenance.export. These extend existing
TENANT_ADMINISTRATION template-derived roles, including UM Kiralama, through audited
migration grants. Custom roles are unchanged and PlatformAccess gains nothing.
Runtime checks use permission keys, never role names.

SELECTED_BRANCHES must cover both the machine's current branch and the work order's
responsible branch; unassigned branch records are restricted to ALL_BRANCHES.
Filters cannot widen scope. A responsible service branch may differ from the machine
branch, but both must be accessible. Technician membership must be active, same tenant
and have access to the responsible branch. History remains stored after branch changes;
current authorization still controls visibility.

Costs are omitted entirely without costs.view, including mutation/list responses.
Costs.edit alone permits a write without disclosing stored amounts. This does not grant
acquisition-cost, rental-price, finance analytics or export-cost permissions.

## API and client

Base: `/organizations/:organizationId/maintenance`.

- GET / and /:id: cursor list and detail. Filters: q (number/title/fleet number),
  machineId, branchId, type, status, priority, open, overdue, plannedFrom/To,
  dueFrom/To; default 25, maximum 100, descending createdAt/id cursor.
- POST /; PATCH /:id: draft creation and permitted edits.
- POST /:id/open, /schedule, /start, /complete, /cancel: explicit workflow actions.
- PATCH /:id/tasks/:taskId: completion and notes.
- POST /:id/materials, /costs: append material usage or a protected cost.
- GET/POST /plans; PATCH /plans/:id: reusable plans.
- GET /machines/:machineId/plans; POST /machine-plans: scoped assignments.
- GET/POST /machines/:machineId/blocks; POST /machines/:machineId/blocks/:id/release.
- GET /machines/:machineId/export/pdf or /xlsx, optional locale=en/tr.

Shared Zod contracts live in packages/validation; the mobile-compatible client and
strict method/path bridge allowlist live in packages/api-client. The Next.js bridge
retains tokens server-side and preserves its same-origin mutation checks. Only the
explicit PDF/XLSX export paths receive binary forwarding; ordinary API paths remain JSON.

## Web and exports

`/maintenance` and `/maintenance/:id` provide list/search/status/type/priority/overdue
filters, creation/editing, localized workflow controls, checklist, materials and costs.
Machine detail shows open/recent completed work orders and links to filtered history.
Machine selection currently uses the shared Machine client and requires machines.read
in addition to work-order permissions; administrative templates have both.

The maintenance document explicitly requires PDF/XLSX machine-history export. This
phase supplies a TECHNICAL_HISTORY report with machine identity, UTC generation
metadata, visible work orders, checklist/material information. PDFKit and ExcelJS are
backend rendering libraries, not a separate reporting service. Bundled OFL Noto Sans
supports Turkish text. Export authorization requires maintenance.read and export;
branch/tenant scope is identical to reads. Costs, acquisition data, rental customers,
rates, internal technician notes and completion free text are excluded from this
profile. XLSX user strings remain strings, not formulas. No public links are created.
Cost-inclusive/internal/resale profiles, certificates, attached documents and signatures
remain deferred. Export requests are audited and do not modify technical history.

## Audit and transactions

Work-order creation/edits/transitions, branch changes, checklist changes, materials,
cost additions, plan changes, technical restrictions/releases and service projections
share the business transaction and audit failure rolls back the mutation. Audit
metadata contains identifiers/state changes rather than costs, notes or complaints.
Reports are requested through a scoped audited application read before rendering;
a rendering failure can leave an export-request audit, but no business changes.

## Verification and UM Kiralama smoke test

Automated tests run against a disposable database. They cover tenant/branch/permission
negatives, FK isolation, workflows, current restrictions, concurrent completion and
blocking, cost omission, audit rollback, counters, cursors, due dates, calendar snapshots,
workshop overlap, HTTP guards, binary exports and shared client contracts. Existing
Machine service-mutation test setups now use Maintenance block/release while retaining
rental/service independence assertions; direct Machine service edits are tested as denied.

After technical verification, use the real tenant browser:

1. Restart API/web development servers and sign in as the UM Kiralama tenant user.
2. Open Maintenance; create an INFORMATIONAL inspection for a disposable ACTIVE machine,
   with planned/due timestamps and two checklist tasks. Verify fleet number and branch.
3. Open and schedule it. Try an overlapping planned work order/rental; expect conflict.
4. Start work on a returned machine; verify OUT_OF_SERVICE without a rental-state change.
   Try starting a different work order on a RENTED machine; expect rejection.
5. Complete both tasks, record material usage and a TRY labor cost. Enter completion
   notes and complete. Verify the completed record remains readable.
6. Repeat with a second blocking work order or manual restriction: completing one must
   not reset NORMAL. Explicitly release the remaining manual restriction with a reason.
7. Confirm Machine edit cannot change service state. Existing non-normal states should
   remain restricted until an authorized release, not disappear on deployment.
8. Create a calendar plan with an explicit interval/basis; assign it to a machine and
   generate a work order. Complete it and check next due; repeated completion must not
   advance twice. Verify overdue filtering and UTC/tenant-timezone presentation.
9. Open Machine maintenance history. Export PDF/XLSX in English/Turkish; check machine
   identity, characters and records, and confirm private notes/costs are absent.
10. Confirm the platform-only operator cannot access maintenance. Automated fixtures
    cover selected branches and finance permission denial without altering real grants.

Verification on 2026-10-21: the additive maintenance migration and seed succeeded
against the local development database. All 107 automated tests passed. Workspace
lint, strict TypeScript, formatting and full build passed, including Next.js and
Expo iOS/Android exports. PostgreSQL/TimescaleDB and Redis are healthy. UM Kiralama's
administration role has all 13 maintenance grants; no real tenant work orders were
created. The test runner reports a non-failing pg concurrent-query deprecation warning.
The subsequent [E2E system](19-E2E-TESTING.md) exercises Maintenance and calendar plans
through the real browser UI with isolated personas, including downloaded PDF/XLSX
content and rendered PDF review. Real Auth0/provider verification remains separate.

## Deferred boundaries

No telemetry ingestion, CAN/fault integration, operating hours, GPS, predictive logic,
remote commands, inventory balances/purchasing/suppliers, invoices, payments, ROI,
profitability or accounting. Parts are consumption descriptions only. No customer-bound
field service, return inspection subsystem, recurrence background jobs, notifications,
mobile management UI or arbitrary workflow builder. Existing architecture and service
state dimensions are retained; no new ADR is required for this phase.

## Operations integration

The [Operations dashboard](23-OPERATIONS-DASHBOARD-IMPLEMENTATION.md) consumes the existing work-order/plan deadlines and service restrictions without changing them. Calendar plans are readable under `maintenance.read`; management controls continue to require `maintenance.plans.manage`. Dashboard plan links select the machine's plan assignments. Notifications do not generate or complete work orders.
