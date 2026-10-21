# Machine implementation

Implemented in the existing modular monolith. Technical verification completed on 2026-10-19. This phase concerns physical/commercial rental assets only.

## Aggregate and identifiers

`Machine` belongs to one Organization. It stores a fleet number, optional serial number and model year, branch, ownership, acquisition data, notes, static specifications, three independent state dimensions, UTC creation/update timestamps and creator/updater User references.

`MachineCategory` and `MachineModel` are tenant-owned catalog identities. MachineModel holds manufacturer, model name and category; Machine references it through `(organizationId, modelId)`. Categories are data, not a fixed equipment enum. Creating/updating a machine resolves or creates the matching catalog identity transactionally. Catalog identity spelling is preserved from first creation. Changing the selected model/category associates the unit with another identity; it does not edit all other machines. There is no separate catalog administration feature in this phase.

Fleet numbers are required and unique within an organization, including sold/retired assets. Comparison uses trimmed Unicode NFKC uppercase keys while the display spelling is retained. A fleet number can be corrected through an audited update; the UUID remains the stable identity. Serial numbers are optional, searchable, nonunique manufacturer references: they are not assumed globally unique or used as authorization keys. Model year is an optional four-digit calendar year, not inferred from serial numbers.

Ownership is optional: OWNED, LEASED, THIRD_PARTY. Unknown ownership stays null; leases/contracts and third-party settlement are not implemented.

## State dimensions

- Rental: NOT_RENTED, RESERVED, RENTED. New machines start NOT_RENTED. Clients cannot write rental state; the Rental workflows now own its transactional projection. See [Rental implementation](17-RENTAL-IMPLEMENTATION.md).
- Service: NORMAL, MAINTENANCE_DUE, MAINTENANCE_REQUIRED, OUT_OF_SERVICE, SERVICE_BLOCKED. Defaults to NORMAL; authorized Machine updates may explicitly change it, with a dedicated audit event. No maintenance scheduling, work orders or inferred repair completion exist yet.
- Lifecycle: ACTIVE, SOLD, RETIRED. New assets start ACTIVE. The archive endpoint transitions ACTIVE to SOLD or RETIRED. It rejects reserved/rented machines and does not change rental/service state. Repeating the same archive is idempotent. Sold/retired machines remain readable and cannot be edited until explicitly restored through the audited restore action.

There is no generic status or authoritative availability flag. NOT_RENTED is not a promise of availability. Connectivity and operational states are absent rather than fabricated. The specific Domain Model and ADR-007 terms are used; the rental document's illustrative DECOMMISSIONED wording is not introduced as a competing lifecycle value.

## Branch and tenant behavior

Every repository operation uses a trusted tenant context. Machine-to-Model, Model-to-Category and Machine-to-Branch relations use organization-scoped composite foreign keys. Cross-tenant associations fail at the database layer as well as in the application.

ALL_BRANCHES members can access organization machines, including unassigned machines. SELECTED_BRANCHES members can access only machines whose current branch is in their current allowed scope; an empty selection grants no Machine access. Unassigned machines are not exposed to selected-branch members. A filter cannot widen membership scope.

Assignment requires an active destination branch in the same organization and within membership scope. Updates require access to the existing machine before assignment, so users cannot pull machines from unauthorized branches into their own. Clearing a branch requires ALL_BRANCHES. Branch changes are immediate audited assignments, not scheduled logistics/transfer workflows. Branch choices expose only active permitted branches. Customers remain organization-wide; their branch behavior is unchanged.

## Technical specifications

Static unit specifications use a JSONB object validated by the shared strict Zod registry. This avoids unlimited nullable Machine columns and permits new reviewed specification keys without changing the table shape. Unknown keys are rejected; the JSON field is not an unrestricted telemetry container.

Initial keys:

- workingHeightM, platformHeightM, overallLengthM, overallWidthM, stowedHeightM: metres.
- platformCapacityKg, machineWeightKg: kilograms.
- driveType, powerSource, batteryType: descriptive static text.

Measurements must be finite and positive; working height cannot be below platform height when both are supplied. No machine-size ceiling is invented. Missing values mean unknown, not zero. PATCH specifications replaces the complete object, allowing explicit removal of obsolete values. These are unit configuration/specification values. Shared model-level specification defaults and inheritance are deferred; there is no duplicated authoritative model/unit specification store.

## Finance boundary and permissions

Acquisition date is a date-only value. Acquisition cost is a nonnegative decimal string in JSON and PostgreSQL NUMERIC(30,6), with an explicit three-uppercase-letter currency code. Cost and currency must both be present or both null. The storage precision limit is a representation constraint, not an operational maximum price. Money never passes through JavaScript Number arithmetic. Zero is valid; unknown is null. Currency changes do not convert or recalculate amounts.

- machines.read: list, detail, branch choices.
- machines.create: creation.
- machines.update: operational/specification edits, branch changes and manual service state changes.
- machines.archive: retirement/sale lifecycle transition.
- finance.acquisition_cost.view: permits cost and currency in responses, in addition to the required Machine permission.
- finance.acquisition_cost.edit: permits supplying/changing/clearing cost and currency, in addition to the required Machine mutation permission.

The project owner explicitly approved all six grants to existing TENANT_ADMINISTRATION templates. The additive migration records each grant in a SYSTEM audit event. Future templates include them too. Custom roles are unchanged; runtime checks never authorize by role name/template. PlatformAccess grants none of these capabilities.

Without cost-view permission, both cost and currency keys are omitted from every response, including mutation responses. Operational patches preserve hidden values. Even explicitly supplying null money fields requires edit permission. The web cost editor requires both view and edit; the API allows deliberate blind writes by an edit-only principal without revealing values.

No ROI, profitability, depreciation, financial entries, exchange rates or accounting integration are implemented. The two financial permissions protect asset acquisition data only.

## Application and audit boundaries

Thin Nest controllers call MachineService, which depends on repository/unit-of-work ports. The Prisma adapter owns database queries. Serializable transactions encompass live access checks, catalog resolution, writes and audit events. Unique/concurrent transaction conflicts return 409 for reload/retry. Sensitive values, credentials and free-text notes are not copied into audit metadata.

Events: MACHINE_CREATED, MACHINE_UPDATED, MACHINE_BRANCH_CHANGED, MACHINE_SERVICE_STATE_CHANGED, MACHINE_LIFECYCLE_CHANGED, MACHINE_ARCHIVED. Branch/state events include previous and next branch IDs or canonical state values. Audit failure rolls back the entire operation, including any catalog identity created along with a machine.

## API

Base: `/organizations/:organizationId/machines`.

| Method | Suffix | Purpose |
| --- | --- | --- |
| GET | / | Search/filter and cursor page |
| GET | /branches | Active authorized branch choices |
| GET | /:machineId | Detail |
| POST | / | Create |
| PATCH | /:machineId | Update supplied fields |
| POST | /:machineId/restore | Restore SOLD/RETIRED to ACTIVE with a required reasonCode; requires machines.archive |
| POST | /:machineId/archive | Body `{ "lifecycleState": "RETIRED" }` or SOLD; defaults to RETIRED |

List query: q, fleetNumber, manufacturer, model, serialNumber, category, branchId, lifecycleState (ACTIVE default or SOLD/RETIRED/ALL), rentalState, serviceState, limit and cursor. Text filters are case-insensitive contains matches and combine with the other filters. Cursor pagination follows Customers: createdAt/id descending, default 25 and maximum 100 rows, nextCursor passed unchanged with the same filters; no total count.

Mutation contracts reject unknown fields, including organizationId, rentalState, lifecycleState, telemetry and device fields. Shared Zod contracts and the transport-injectable API client support later mobile use. No mobile management UI is added.

## Web and tenant smoke test

`/machines` provides the English/Turkish list, filters and creation. `/machines/:id?organizationId=...` provides details/editing, static specifications, acquisition information and independently displayed state dimensions. The existing Auth0 server-side bridge holds tokens, validates mutation origins and allowlists Machine routes/methods.

For the real UM Kiralama user after applying migration and restarting the API/web:

1. Open `/api/backend/me`; confirm the four machines permissions and two acquisition-cost permissions. Platform permissions must remain absent.
2. Open `/machines`, select UM Kiralama, create a development asset with a unique fleet number, Galen/ES1012 and an electric scissor lift category. Use an existing authorized branch or Unassigned for ALL_BRANCHES.
3. Enter known static dimensions and a decimal acquisition value with currency; leave unknown fields empty. Save, open details and reload.
4. Search by fleet/serial/manufacturer; combine category, branch and state filters. Verify pagination as the directory grows.
5. Edit notes/specifications and service state. Confirm rental state remains NOT_RENTED. Confirm acquisition values persist exactly.
6. Attempt a duplicate fleet number; expect conflict. Negative measurements and incomplete cost/currency pairs must be rejected.
7. Retire the disposable test machine. It disappears from default ACTIVE results, remains under RETIRED/ALL, and is no longer editable.
8. Confirm the platform-only operator receives no Machine organization access. Automated fixtures cover selected-branch and financial-permission denial without changing real membership grants.

Do not use live telemetry values as specifications. Live GPS, battery SoC, CAN, faults, devices, provider adapters, remote commands and connectivity health remain outside this phase. A Machine is never a TrackingDevice.

## Verification

The additive migration and seed were applied locally. All 65 automated tests,
workspace lint, strict typechecks, formatting and full build passed. The full build
includes Next.js and Expo iOS/Android exports. Both development administration
templates have all six approved grants; the migration recorded 12 grant audit events.
The real UM Kiralama Machine browser smoke test remains pending.

Run `pnpm db:migrate`, `pnpm db:seed`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`. The integration suite uses a fresh isolated local database and checks CRUD, all branch/tenant boundaries, cost field omission, audit rollback, identifiers, states, acquisition/specification validation, pagination and real Nest HTTP guards. Real tenant UI smoke testing is a separate manual step; no real Machine data is created by the automated tests.

## Related documents

- [Domain model](03-DOMAIN-MODEL.md), sections 12–15.
- [Authorization](05-AUTH-AND-PERMISSIONS.md), branch and financial access.
- [Security](10-SECURITY.md).
- [Coding standards](11-CODING-STANDARDS.md).
- [ADR-007](decisions/ADR-007-SEPARATE-MACHINE-STATE-DIMENSIONS.md).
- [ADR-008](decisions/ADR-008-PERMISSION-BASED-AUTHORIZATION.md).

No architectural replacement or additional ADR is introduced.

## Corrections and restoration (2026-10-21)

Reserved/rented is no longer a blanket edit lock. Descriptive corrections use the
existing machines.update permission and transaction. Model changes resolve a new
or existing tenant catalog identity for this physical asset; they never rename a
shared model or rewrite a RentalItem's requested model. MACHINE_UPDATED records
previousModelId and nextModelId; old catalog records and assignment IDs remain.

Branch, model/category and static specification edits must preserve committed
Rental requirements. Validation reuses Rental matching and scheduling rules,
including unallocated category/model capacity. Compatible edits are allowed;
changes that invalidate a commitment roll back with MACHINE_COMMITMENT_CONFLICT.
An exact-model booking still requires that identity; changing its commercial
requirement is not inferred from editing the asset. Notes, identifiers and
financial corrections keep existing permissions. Service-state updates remain
possible so an actual breakdown can be recorded even during rental.

Machine updates/archive/restore share Rental's organization scheduling lock in a
Serializable transaction. Concurrent reservation and incompatible asset changes
cannot both commit. Archive checks assigned commitments and unallocated capacity.
Errors expose only stable codes, never other branches' rental/customer details.

POST /organizations/:organizationId/machines/:machineId/restore takes one of:
INCORRECT_SALE, INCORRECT_RETIREMENT, RETURNED_TO_FLEET as reasonCode. The existing
machines.archive permission authorizes lifecycle restoration; PlatformAccess does
not. The UI asks for the reason and confirmation. Restoration sets only lifecycle
ACTIVE and updater metadata, preserves service/rental states and all history,
requires authorized active branch access, and writes MACHINE_RESTORED with prior
state, new state and reason. Audit failure rolls back. Repetition on ACTIVE is an
idempotent no-op. No migration, new permission grant or manual database fix is needed.

The web displays distinct messages for archived assets (restore first), sale or
retirement blocked by assigned rentals, and edits that invalidate commitments.

Correcting an asset's model can leave the previous catalog entry with no machines.
That entry is retained for historical RentalItem references. The Rental catalog
marks whether a model has an ACTIVE asset in the caller's branch scope; new-rental
model choices exclude entries without such assets, while existing selections and
historical labels remain readable. This is not date-specific availability.

Rental requirements can now ask for minimum platformHeightM. Record the actual
static platform height on the Machine: missing heights cannot satisfy a numeric
requirement and are never inferred from model names or working height. Rental
reservation and assignment reuse the same specification matching rules. See
[Rental implementation](17-RENTAL-IMPLEMENTATION.md#platform-height-requirements-and-model-choices).
