# Rental transportation quotes and estimated margin

## Approved scope

The owner approved one combined transport amount per Rental, an estimated margin
excluding VAT, and separate supplier-cost permissions for tenant administration.
The Rental form's **Include transportation in the offer** checkbox adds this charge.
It is a fixed total for the rental, not a rate per machine or rental day. Delivery
and collection are not priced separately in this version.

Enter the customer price, currency and VAT treatment. Authorized cost users may
also enter the transport company's name/reference, quoted cost and its separate
VAT treatment. Currency choices are TL (stored TRY), USD and EUR. Both sides use
the same currency; there is no conversion or cross-currency margin calculation.
Unknown supplier cost remains absent, never zero. Zero prices/costs and negative
margins are valid. A blank supplier quote leaves margin unavailable.

## Aggregate, history and lifecycle

`RentalCharge` implements the existing domain model's separate additional-charge
concept, with `kind=TRANSPORT`. A composite organization/rental FK protects tenant
ownership. A partial unique index permits one current combined transport quote per
rental. Commercial values use decimal(30,2), explicit VAT snapshots, and an actor
and timestamp. No live values or charge fields are added to Machine.

Create/edit/remove transport in DRAFT or QUOTED using the existing Rental POST/PATCH
contracts. The optional `transportation` object contains `customerPrice`,
`customerTax`, `currency`, and optional `supplierQuote: {name, amount, tax}`.
`transportation: null` removes it from the current offer. Omission preserves it.
Replacing/removing a quote timestamps the old record and retains it in history;
it is not deleted. Unrelated edits leave the quote untouched. Reservation freezes
transport along with the existing agreed commercial terms. Extensions, machine
quantity, replacements and partial returns do not multiply or rewrite transport.
Cancellation retains terms/history and excludes the quote from Finance totals.
No transport dispatch/delivery state or actual transport-cost tracking is implied.

Responses include `transportation` and `transportationHistory`, redacted server-side
on every list/detail/mutation response. Revisions are audited as
`RENTAL_TRANSPORT_CHANGED` without amounts, company names or free-text VAT reasons in
audit metadata. Existing organization serialization and transactional audit rules
apply; an audit failure rolls back both the quote and its history changes.

## Permissions

- Existing Rental read/create/update and tenant/branch rules still apply.
- `rentals.pricing.view` exposes the customer transport price and its VAT terms.
- `rentals.pricing.edit` allows changing the customer quote or inclusion.
- `rentals.transport_costs.view` exposes supplier quote/name/VAT.
- `rentals.transport_costs.edit` additionally permits submitting/clearing supplier
  costs. Removing a current charge containing a supplier quote also requires it.
- Margin requires both pricing-view and transport-cost-view, including in history,
  Finance aggregates and XLSX. Neither financial view permission implies the other.

A price edit omitting `supplierQuote` preserves the stored supplier quote even when
the actor cannot see it. Currency cannot change while implicitly retaining that
quote: resubmit supplier terms with cost-edit permission. The UI edits only fields
the actor can both see and edit. Administration marks the new grants as sensitive.

The additive migration grants both permissions to existing roles originating from
TENANT_ADMINISTRATION (including UM Kiralama), with SYSTEM audit events. New
templates include them through the permission catalog. Custom roles and
PlatformAccess gain no implicit access. Normal administration grant ceilings apply.

## Finance read model and calculation

**Estimated transport margin = VAT-exclusive customer price − VAT-exclusive supplier
quote.** The shared backend VAT breakdown uses decimal arithmetic and half-up
rounding to two decimals. Each side has its own included/excluded rate or explicitly
documented non-applicability. Document absence never implies VAT exemption.

The Finance report has a separate `transportation` summary grouped by Rental status
and currency. It uses current quote versions only, counted once by planned rental
start; drafts without a planned start use creation time. Period bounds are
`[from,to)`. Cancelled rentals are excluded. Completed rental groups still represent
quote estimates, not proof of completed transport, actual supplier cost, collected
cash, invoiced revenue or accounting profit.

This is a rental-level commercial forecast, not an accrued amount: it is not prorated
over days, multiplied by quantity, allocated to machines, or included in equipment
contribution/recovery/utilization. Machine/model/category filters omit transport
summaries; organization, customer, status and responsible branch filters apply.
Grouping/sorting/pagination of the machine table does not change this separate
summary. The same 10,000-source-record safeguard applies; it fails rather than
silently truncating totals. Selected-branch reads require all historical assigned
machines and the responsible Rental branch to be in scope, matching Rental access.

Finance still requires `finance.analytics.view` and existing source access; export
also requires `finance.analytics.export`. Supplier totals, missing-quote counts and
margin are omitted without cost-view permission. Customer totals are omitted
without pricing-view permission. Any missing supplier quote makes its group's
supplier total/margin unavailable instead of understating costs. Currencies are
never added together. XLSX includes a separately permission-filtered Transportation
sheet with the same semantics and warnings.

## Boundaries and verification

This phase does not generate invoices, customer receivables or supplier payables;
quoted margins cannot settle obligations. Approved Finance records remain separate,
explicit records under ADR-012. No supplier ERP, vehicle routing, trip scheduling,
transport confirmation, external integrations or mobile management UI is added.

Additive migration: `202611240001_rental_transportation`. Existing rental/customer/
machine/finance amounts remain unchanged; old Rentals simply have no transport
charge. There is no database reset or inferred historical transport cost.

Automated coverage includes VAT bases, decimal precision, losses/zero/unknown cost,
validation, tenant/branch scope, independent price/cost redaction, hidden-cost
preservation, currency protection, revisions/removal/freeze, uniqueness/composite
FKs, audit rollback, cancellation, date/stage/currency grouping and export redaction.
Playwright exercises real form creation, reload/edit, historical quote visibility,
reservation, Finance/XLSX margin, cancellation and the no-finance persona.

Run `pnpm db:migrate`, `pnpm db:seed`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`,
`pnpm typecheck`, `pnpm format:check`, and `pnpm build`.

Verified locally on 2026-11-24: the migration and permission seed were applied
without resetting development data; 190 unit/integration tests and all 55
Playwright scenarios passed. Lint, strict type checking, formatting and the full
workspace build passed. The saved Finance browser screenshot was also inspected.
Browser verification used isolated E2E personas; this change did not automate a
personal Auth0 login. Hosted results are recorded separately in the
[current verification baseline](19-E2E-TESTING.md#current-verification-baseline).

Related: [Rental implementation](17-RENTAL-IMPLEMENTATION.md),
[Finance analytics](21-FINANCE-ANALYTICS-IMPLEMENTATION.md),
[VAT/operational finance](24-FINANCE-OPERATIONS-IMPLEMENTATION.md),
[Rental charges](03-DOMAIN-MODEL.md#28-rental-charges), ADR-008 and ADR-012.
