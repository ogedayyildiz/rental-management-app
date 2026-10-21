# Rental / reservation / contract implementation

Implemented inside the existing modular monolith. This phase implements operational contracts and scheduling, not legal document generation or invoicing. See [Rental Business Rules](07-RENTAL-BUSINESS-RULES.md), [Domain Model](03-DOMAIN-MODEL.md), [Authorization](05-AUTH-AND-PERMISSIONS.md), [Customers](15-CUSTOMER-IMPLEMENTATION.md), [Machines](16-MACHINE-IMPLEMENTATION.md), ADR-001, ADR-007 and ADR-008.

## Aggregate and identifiers

`Rental` is the agreement aggregate. Its RESERVED phase represents a committed booking; there is no competing Reservation aggregate. It references the stable same-tenant Customer UUID, responsible Branch, notes, planned date envelope, actual start/end, cancellation reason, UTC timestamps and creator/updater Users. Customer data is not copied into an authoritative second customer record. Display names resolve from current Customer data; immutable legal-party/document snapshots are deferred until legal documents are implemented.

`RentalItem` represents equipment demand: category/model, quantity, static specification requirements, planned period and agreed commercial terms. `RentalMachineAssignment` records the physical machine separately, with assignment/release, actual dispatch/return and reason. Multiple items, units, deferred allocations, replacements and partial returns are supported. Draft revisions mark old items removed and old assignments released rather than deleting history.

`RentalItemTerm` preserves the baseline agreed period at reservation and append-only extension segments, including the actor and exact agreed rate. Original item rates are never changed after commitment. `RentalCounter` allocates tenant/year display numbers such as `R-2026-000001`; the year uses the tenant timezone. Counter increment and creation commit together, backed by `(organizationId, number)` uniqueness. UUID remains the internal identity. Number format customization is deferred.

Composite foreign keys scope Customer, Branch, category, model, item, assignment and Machine relationships by organization. There is no client-supplied authoritative tenant context. Database checks enforce positive quantity, complete/ordered planned periods, complete nonnegative monetary triples and valid actual periods. A partial unique index permits only one open dispatched assignment per physical machine.

## Workflow and state ownership

```text
DRAFT → QUOTED (optional) → RESERVED → ACTIVE → COMPLETED
  └───────────────┴───────────┘
              CANCELLED
```

- Drafts and quotes do not consume scheduling capacity. They may have incomplete dates/prices. Quoting and reserving require complete periods, prices and at least one item.
- Reservation checks an active Customer, permitted active branch, requested equipment, machine eligibility and scheduling capacity. Category/model quantity can reserve capacity without physical assignments.
- Dispatch acts on selected assignments. All machines must be assigned before their individual dispatch, not before the first machine on the agreement starts. Actual start is explicit, cannot be in the future and cannot overlap a machine's recorded physical rental history. Dispatch starts ACTIVE.
- Return acts on selected assignments with an explicit nonfuture timestamp at or after their dispatch. Other assignments remain on rent. Completion is a separate action requiring the whole requested quantity to have returned; actual rental end is the latest return.
- Cancellation requires a reason and is limited to DRAFT, QUOTED or RESERVED. An active rental must use return/completion. No delete endpoint exists.
- Extensions strictly lengthen selected item end times, append agreed price segments and recheck conflicts transactionally. Omitted price changes retain the most recent agreed terms. Completed quantities cannot be extended.
- Replacement requires update, dispatch and return permissions. It closes/releases the previous assignment and starts a new assignment atomically, preserving both histories and the reason. It must satisfy the requested category/model/specifications. For an exact-machine-only requirement without category/model, replacement must use the same model. Releasing an unstarted assignment back to an unallocated pool requires an explicit category/model; revise an exact-machine draft or cancel/recreate its reservation instead of silently broadening its equipment requirement.
- Repeated reserve, quote, dispatch, return, cancel and complete requests do not duplicate transitions/audits. Incompatible replays, including repeated extension/replacement, fail without creating duplicate terms or assignments. Concurrent mutations may receive 409 and must refresh before retrying. Automatic blind retries are not used.

Rental workflows are the only application writer of `Machine.rentalState`. Generic Machine create/PATCH rejects that field. Within the transaction, affected machines are recalculated from all committed assignments: an open dispatch means RENTED; otherwise a live unreturned reservation means RESERVED; otherwise NOT_RENTED. A future physical reservation therefore keeps RESERVED even after a different rental returns. This summary is not date-specific availability. Unallocated demand cannot label an arbitrary physical machine RESERVED.

Service and lifecycle states stay independent. ACTIVE lifecycle and NORMAL or MAINTENANCE_DUE service are eligible; MAINTENANCE_REQUIRED, OUT_OF_SERVICE and SERVICE_BLOCKED prevent reservation/dispatch. SOLD/RETIRED cannot enter new rentals. Returns never clear service blocks. Machine corrections are allowed when they preserve committed requirements. Branch, model/category and specification changes transactionally revalidate assigned requirements and unallocated capacity using Rental matching/scheduling rules and the same scheduling lock. Incompatible edits fail with MACHINE_COMMITMENT_CONFLICT. Exact-model requirements are never silently rewritten; see [Machine corrections](16-MACHINE-IMPLEMENTATION.md#corrections-and-restoration-2026-10-21). Notes, financial data and explicit service changes keep their existing permissions. Connectivity has no role here.

## Availability and concurrency

A RESERVED machine can appear in a new rental's availability results when the
requested period does not overlap its commitments. The summary rental state is
not a blanket exclusion from future bookings. A merely overdue, undispatched
reservation is distinct from an overdue machine that is physically still on rent.

Planned intervals are end-exclusive `[start, end)`, so adjacent bookings are allowed. RESERVED and ACTIVE commitments block capacity; DRAFT, QUOTED, CANCELLED and COMPLETED do not. Returned assignments release their quantity. An overdue dispatched assignment conservatively blocks future capacity until actually returned; reaching a planned date does not return a machine.

Availability considers both exact assignments and unallocated category/model demand. At each relevant interval boundary, bipartite matching checks whether all demand can be covered by eligible machines in the source branch. This prevents two category/model reservations from consuming the same remaining unit. Hypothetical capacity matching does not itself assign units: physical allocation checks again. Requested numeric static specifications are minimum requirements and text specifications are exact matches; unknown machine values do not satisfy them. This initial convention is explicit, not an unrestricted expression language; maximum dimensions or richer substitution policies require future contracts.

All Rental writes run in a PostgreSQL Serializable transaction and acquire an organization row-version lock before scheduling. The lock writes the same name value and does not change business values; it intentionally serializes writes within one tenant, including initially empty schedules/counters. A concurrent stale snapshot receives a safe 409 rather than committing a double booking. All assignment, state, price-history and audit writes share the transaction. The database's one-open-assignment index independently protects physical dispatch. The implementation reads current tenant commitments internally for capacity matching; it never returns unauthorized branches' rentals. This favors correctness for the initial fleet scale; large fleets may later require bounded scheduling projections without weakening the transaction guarantee.

The availability endpoint returns eligible free machines with cursor pagination. Passing a rental/item pair evaluates allocation inside that booking instead of double-counting its reserved quantity. Its dates must match that item. Temporary selection is not a hold. Final reserve/assign/dispatch/extend remains authoritative.

## Branch behavior

A rental and its assigned machines must use the same responsible/source branch in this phase. ALL_BRANCHES may use a tenant branch or an unassigned (`null`) branch pool. SELECTED_BRANCHES requires a selected branch and cannot read/operate unassigned or other-branch rentals. Filters cannot expand access. Reads also require every associated machine's current branch to be in scope, including history; if a historical machine later moves outside scope the aggregate is conservatively hidden from that selected-branch user. Historical branch snapshots and cross-branch transfers are not introduced here.

Customers remain organization-wide under the existing Customer rules. The UI's customer search uses `customers.read`; rental operations validate the referenced active same-tenant Customer independently. Administrators already have the required customer grant.

## Pricing and permissions

Rates are decimal strings over HTTP and NUMERIC(30,6) in PostgreSQL. No JavaScript Number money arithmetic, duration rounding, FX conversion or totals are implemented. Currency is explicitly supplied, not inferred from language. Units: HOURLY, DAILY, WEEKLY, MONTHLY, FIXED_PERIOD and MANUAL. A unit records the agreement; it does not imply an invoicing formula. Extension segments may store revised terms without rewriting original pricing.

Create/Edit Rental uses a currency dropdown with canonical codes and localized
currency names. Turkish lira is submitted as TRY, not TL. The browser supplies
its supported currency choices and preserves an existing code when editing.
Changing language or currency never converts or recalculates the agreed amount.

| Permission | Operations |
| --- | --- |
| rentals.read | List/detail, catalog, availability |
| rentals.create | Create draft |
| rentals.update | Edit draft/quote, quote, allocate/release |
| rentals.reserve | Confirm reservation |
| rentals.dispatch | Start selected units |
| rentals.return | Return selected units and complete |
| rentals.cancel | Cancel before dispatch |
| rentals.extend | Extend committed periods |
| rentals.pricing.view | Include rates, units, currencies, commercial notes and term history in any response |
| rentals.pricing.edit | Supply/change commercial fields, including clearing them |

Replacement requires update + dispatch + return. Operations do not imply price visibility. A dispatcher may operate an already-priced rental without receiving its rates. A user without price edit can edit operational draft metadata but cannot replace already-priced items to bypass the restriction. All response paths redact financial fields on the backend.

The project owner approved all ten permissions for TENANT_ADMINISTRATION templates and existing template-derived roles, including UM Kiralama. Migration grants are audited as SYSTEM actions. New templates include these permissions through the existing catalog. Custom roles remain unchanged. PlatformAccess confers no Rental access. Authorization never checks role names.

## REST and shared contracts

Base: `/organizations/:organizationId/rentals`.

| Method/path | Contract |
| --- | --- |
| GET / | `q`, customerId, machineId, branchId, status, current, plannedFrom/To, actualFrom/To, cursor, limit |
| GET /:id | Full aggregate, scoped and price-redacted |
| GET /catalog | Tenant category/model (including model availableForRental), active permitted branch choices, timezone |
| GET /availability | plannedStartAt/EndAt, optional branchId/requestedCategoryId/requestedModelId/platformHeightM/q, optional rentalId + itemId, cursor/limit |
| POST / | customerId, optional branchId/notes, items; creates DRAFT |
| PATCH /:id | Draft/quote customer, branch, notes or complete replacement item collection |
| POST /:id/quote or /reserve | Explicit transition; no status PATCH |
| POST /:id/assign | itemId, machineIds |
| POST /:id/release | assignmentId, reason |
| POST /:id/dispatch | assignmentIds, actualStartAt |
| POST /:id/return | assignmentIds, actualEndAt |
| POST /:id/replace | assignmentId, machineId, actualAt, reason |
| POST /:id/extend | items: itemId, plannedEndAt, optional agreedRate/rateUnit/currency |
| POST /:id/complete | Explicit completion |
| POST /:id/cancel | reason |

Lists use descending `(createdAt, id)` keyset cursors, default 25 / maximum 100. Planned range filters select overlaps; actual filters include ongoing rentals. `current=true` means RESERVED or ACTIVE. Search covers rental number, Customer name and assigned fleet/serial identifiers.

Zod contracts live in `packages/validation/src/rentals.ts`; mobile-compatible fetch client and proxy allowlist are in `packages/api-client/src/rentals.ts`. Strict input schemas reject injected status/tenant fields. Payload limits (100 items, 1,000 quantity/assignment identifiers, bounded notes) are initial technical request safeguards, not pricing rules; the existing web proxy also retains its 16 KiB body cap. Large bulk operations are not implemented.

## Audit and application boundaries

Controllers only extract validated access/request context and delegate to RentalService. The service owns workflow, permission and eligibility rules; a Prisma repository/unit of work owns scoped persistence. The Machine state writer is used within the same transaction. Pure availability matching is in `rentals/availability.ts`.

Audits cover creation, draft changes, Customer/branch changes, machine assignment/release, quoting/reservation, dispatch, return, completion, cancellation, extensions and commercial term changes. Actor, organization, action, Rental target, timestamp and request ID are retained. Assignment/term history stores detailed dates/reasons. Audit metadata avoids rates, free-text notes, Customer contact data and credentials. Audit failure rolls back the business mutation, state projection, numbering and history.

## Web and manual smoke test

`/rentals` and `/rentals/:id?organizationId=...` provide EN/TR list/search/filter, draft editor, availability selection, detail/history, operational actions and commercial history. Date display uses the organization timezone. Initial datetime entry and filters are explicitly labeled UTC; convert Istanbul local time to UTC when entering it. Rates remain decimal strings. Workflow buttons are permission/state aware; the backend remains authoritative.

After restarting API/web with `pnpm dev`, sign in as the real UM Kiralama tenant user:

1. Open `/rentals`. Confirm UM Kiralama and the ten Rental permissions in `/api/backend/me`; platform operator must still have no tenant access.
2. Select an active Customer and the same branch as eligible test machines (or no branch for unassigned units). Use search to load Customer choices.
3. Add two requirements or one requirement with quantity two. Choose category/model, planned UTC dates, explicit rates/unit/currency, find available machines and select them. Save a draft; verify a distinct rental number, dates in Europe/Istanbul, exact price strings and unchanged machine rental state.
4. Quote, then reserve. Verify physical units become RESERVED. In another draft, reserve an overlapping period for the same machine: expect conflict. An adjacent period should be allowed. Cancel extra test bookings with a reason.
5. Check category/model booking without machine IDs consumes capacity; allocate physical units later from the detail page.
6. Select assignments and enter actual UTC start at or before now. Dispatch; verify ACTIVE and RENTED. Change language and verify values/currencies remain identical.
7. Extend the planned end. Verify original term history is retained; an extension crossing another booking must fail without changing dates.
8. Partially return one unit. Other units remain rented; completion stays unavailable. If testing replacement, supply a reason and actual timestamp and choose an eligible replacement; old history must remain visible.
9. Return the remaining units and complete. Confirm independent service states remain unchanged and machines become NOT_RENTED or RESERVED if another valid reservation exists. Completed rental stays readable and cannot dispatch again.
10. Confirm filters/cursors and direct detail links work. Repeating workflow actions must not create duplicate assignments/audits. Inspect audit records through approved tooling without tokens/credentials.

Automated tests use a fresh local test database and local verifier boundary; no live Auth0 service or real tenant rentals are needed. Real UM Kiralama Rental smoke testing remains a manual follow-up; the implementation does not create business rentals in that tenant automatically.

## Boundaries and deferred scope

No new architecture/ADR is needed: this follows the documented aggregate and existing modular monolith. Acquisition data remains owned by Machines. Rental stores agreement prices only. No invoices, taxes, discounts engine, payments, accounting, revenue recognition, ROI or profitability calculations are added. No maintenance schedules/work orders, automatic return inspection, dispatch logistics/transfer subsystem, transport charges, document/PDF generation or notification system is introduced. Manual existing service states remain authoritative for service eligibility. No GPS, CAN, device/provider integration, connectivity or remote commands exist here. Full mobile Rental UI is deferred; shared contracts support later consumption.

## Technical verification

The dated results below record the initial implementation, not the latest
verification status. Subsequent user-reported UM Kiralama browser checks confirmed
Customer and Machine management and the Rental list/form changes. They do not
constitute verification of every step in the full smoke-test checklist.

On 2026-10-21, after the platform-height and model-choice changes, all 91 automated
tests passed, including deferred assignment with a minimum platform height,
invalid height rejection and preservation of orphaned historical models.
API/web builds, lint, strict TypeScript and changed-code formatting checks passed.
The subsequent fleet-number display change passed web build, lint and TypeScript;
removing repeated brand/model text passed formatting. This does not claim a new
full-workspace/mobile build or a completed real return/completion smoke test.

### Customer selector contract

Create Rental uses the shared Customer client's `listActive` lookup with
`status=ACTIVE`, an optional search term and cursor, and the existing
`{ items, nextCursor }` response. Empty search returns active customers within
the authorized organization. Options use Customer `id` and `displayName`.
The Customer query contract does not accept `active=true`: `active` is a
response/persistence field, and sending it as a query parameter causes strict
validation to reject the request with HTTP 400.

The authenticated HTTP regression test exercises the same client method with
two active customers, empty and matching search, cursor pagination, inactive
exclusion, cross-tenant denial and missing `customers.read`. It also preserves
rejection of the invalid legacy query. The Next.js bridge and backend
authorization remain unchanged.

Verified on 2026-10-19:

- Additive migration `202610190001_rentals` applied to local PostgreSQL; essential permission seed completed.
- `pnpm test`: 82 passing tests, including 17 new Rental integration tests and the existing Customer/Machine/authentication suites.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and the full workspace build passed. Next.js includes `/rentals` and `/rentals/[id]`; Expo iOS/Android exports passed.
- UM Kiralama's administration role has all ten approved Rental permissions. The original platform operator still has zero tenant memberships. No real-tenant Rental records were created by verification.
- PostgreSQL/TimescaleDB and Redis report healthy.
- Tests emit a non-failing PostgreSQL client concurrent-query deprecation warning; no dependency upgrade is introduced in this domain phase.
- At that date, the real UM Kiralama browser Rental smoke test above remained pending.

## Create a customer while preparing a rental

Users with customers.create can open the existing Customer form beside the
Customer search in Create/Edit Rental. The rental form stays mounted and retains
its dates, items, rates and notes. The search text prefills the customer name.
Saving uses the existing shared Customer schema, client and authorized creation
endpoint; the resulting customer is selected immediately. Validation/conflict
failures retain the customer form for correction; cancelling returns to the
unchanged rental draft. Creating a Customer is an independent audited operation:
closing the rental draft afterwards does not remove that Customer. No new
endpoint, authorization bypass or database change is introduced.

## Platform-height requirements and model choices

Create/Edit Rental offers an optional minimum platform height in metres using
`RentalItem.specifications.platformHeightM`. No working-height question is added.
Select a category (and optionally a model), quantity and height to reserve demand
without selecting physical machines. Positive finite measurements are required;
unknown machine heights do not satisfy the requirement. Availability accepts
`platformHeightM` and uses the same minimum-specification matching rule as later
reservation and assignment. Changing the height clears provisional machine choices.

The catalog retains historical model names, but marks `availableForRental` only
when an ACTIVE asset of that model exists in the user's branch scope. New model
choices exclude orphaned models left after corrections, and sold/retired-only
models. An already selected historical model stays visible when editing. This
flag is fleet presence, not date-specific availability; scheduling checks remain
separate. No historical records are deleted or rewritten.

### Fleet identifiers in the rental list

Each current rental item lists its non-released assigned machines individually,
using fleet numbers beneath the model summary. Identical models therefore remain
distinguishable. Unassigned quantities are labelled as awaiting machine assignment;
released/replaced assignments remain in detail history rather than appearing as
current assignments in the list.

## Return and completion in the browser

Returned is an assignment-level fact, represented by actualEndAt, not an
additional Rental status. Complete applies to the Rental aggregate. With
rentals.return, an operator returns selected dispatched machines and then
explicitly completes an ACTIVE rental after every live item's requested quantity
has been returned. The Complete button remains disabled while any quantity is
outstanding; the backend independently validates the same prerequisite.

For two machines returned on different days, record each return separately.
After the second return, use Complete rental. There is no requirement to wait
until plannedEndAt, and completion does not indicate payment. Actual return
timestamps must be nonfuture and at or after dispatch. Returning and completing
do not clear service blocks or erase other reservations.

### Follow-up browser checks

- From Create Rental, create a Customer with customers.create; verify immediate
  selection and preservation of draft dates, rates and requirements. Cancel the
  customer form and verify the rental draft is unchanged.
- Select TRY from the currency dropdown; verify the exact amount survives save.
- Select category, quantity and minimum platform height without a physical
  machine; reserve and later assign a qualifying machine. Unknown/lower heights
  must not qualify. Working height is not asked in this flow.
- Confirm obsolete models without active fleet are absent from new choices while
  historical rental labels remain readable. Existing selections remain visible.
- Check each assigned fleet number under the model summary, without repeating
  brand/model on the smaller line. Check outstanding assignment quantities.
- Verify a nonoverlapping booking permits a reserved machine, while an overlapping
  commitment is rejected by the backend.
- Return one machine from a multi-machine rental: Complete stays disabled.
  Return the remaining required machines: Complete becomes available. Explicitly
  complete before the planned end and verify COMPLETED without a payment action.
