# Operational finance: VAT, acquisition commitments and collections

Rental transport quotes now use the same explicit VAT/decimal conventions; see
[Transportation](25-RENTAL-TRANSPORTATION.md). They do not automatically create or
settle Finance records and are not included a second time as acquisition costs.

## Approved scope

The owner approved preserving existing monetary records with **VAT status to be
specified**, requiring explicit VAT terms on new priced records, application-owned
approved receivables/customer balances/partial collections, and manual leasing
deposit/installment schedules. Historical values are not converted, erased or
assumed to include/exclude VAT. This supersedes the payment-tracking deferral in
Phase 1; ESTIMATE_V1 remains an estimate and never automatically creates debt.

## Boundaries

VAT treatment, invoice/document status, acquisition arrangement and actual money
movement are independent. Absence of an invoice does not select zero VAT.
NOT_APPLICABLE requires a recorded explanation, not automatic tax-law inference.
EXCLUSIVE/INCLUSIVE carry an explicit transaction rate. There is no hard-coded
country tax rate, tax filing, invoice issuance, interest engine or depreciation.

Operational obligations are customer receivables or machine acquisition/financing
payables. The latter can be cash, open account or leasing. Financing commitment is
distinct from Machine acquisition cost; recording installments cannot count the
purchase twice in analytics. Supplier reference is text, not a new supplier ERP.

Drafts are editable; approval freezes amounts, VAT and due schedule. Document
references can still be corrected through a separate audited action. Actual
payments/collections are separate append-only records with
explicit reversal, not destructive edits. Cancellation requires no unreversed
payments. A payment must fit the remaining approved installment, use its currency,
and carry an idempotency key. No FX settlement, overpayments or unallocated credit
in this first version. Current balance is derived from approved amounts less
unreversed payments. Rental completion does not mark a debt paid.

All new operational obligations use TRY (display TL), USD or EUR. Settlement
amounts use two minor-unit decimals. VAT breakdown rounds half-up to two decimals;
inclusive amounts preserve the entered gross, exclusive amounts preserve the
entered net, and VAT is the difference. This is an operational recording
convention, not a certified invoice/tax-calculation engine.

## Persistence and VAT migration

Migration `202611190002_operational_finance` is additive. Existing `Machine`,
`RentalItem`, immutable `RentalItemTerm` and `WorkOrderCost` monetary values receive
`taxMode = UNSPECIFIED`, without changes to their amounts or currencies. The UI
shows **KDV durumu belirtilmeli / VAT status must be specified**. New priced records
require EXCLUSIVE, INCLUSIVE or NOT_APPLICABLE. Unrelated historical edits preserve
unknown VAT; changing an unknown Machine acquisition amount/currency requires a
VAT decision. Known terms can be retained on subsequent price changes. Rental term
history retains its original VAT snapshot. Maintenance cost history is not rewritten.

`FinanceRecord`, `FinanceInstallment` and `FinancePayment` belong to one organization.
Composite foreign keys protect customer, Machine, branch, rental/customer matching,
installment ownership and settlement currency. UUIDs are stable internal IDs;
user-entered titles and optional invoice references are display information.
Amounts use PostgreSQL decimal and decimal.js, never floating-point money arithmetic.

Additive migration `202611190003_preserve_receivable_customer` forbids cascaded
Rental customer updates into Finance records. A Rental with a linked financial
record cannot switch Customer; the UI returns an explicit explanation. Draft
financial links can first be corrected through Finance. Approved/cancelled financial
history is never silently reassigned to a different customer.

Approved records cannot be edited into a different obligation. Correct an erroneous
approved record by reversing recorded payments, cancelling it with a reason, then
creating a corrected record. Cancellation and reversals preserve history. Historical
inactive Customers and sold/retired Machines remain valid financial references, so
outstanding debt is not lost when an operational record becomes inactive.

## Permissions and tenant/branch scope

| Permission | Capability |
| --- | --- |
| `finance.receivables.view` | Read customer receivables and scoped balances |
| `finance.receivables.manage` | Create/edit/approve/cancel receivables and update documents |
| `finance.payables.view` | Read acquisition commitments and balances |
| `finance.payables.manage` | Create/edit/approve/cancel acquisition commitments and update documents |
| `finance.payments.record` | Record a payment or collection against a readable approved record |
| `finance.payments.reverse` | Reverse a recorded payment with a reason |

Receivables also require `customers.read`; payables require `machines.read` and
`finance.acquisition_cost.view`. Rental-linked records additionally require
`rentals.read` and `rentals.pricing.view`, including reads/aggregates. Source-domain
price editing permissions still govern Machine/Rental/Maintenance price fields.
VAT metadata is redacted together with the protected monetary fields.

New permissions are seeded into TENANT_ADMINISTRATION templates and granted to
existing roles from that template by the audited migration. PlatformAccess gains
nothing. Custom roles keep their existing permissions and can be updated through
the normal administration permission ceiling.

SELECTED_BRANCHES access requires the financial record's responsible branch and
the current Machine branch to be allowed; linked Rentals also use the existing
Rental branch scope. Unassigned records are only visible to ALL_BRANCHES members.
Changing a filter never widens scope. Account totals use the same permission/branch
predicate across all matching approved records, independently of pagination.
Currencies remain separate: there is no sum or conversion across TRY/USD/EUR.

## API and transactions

All routes are under `/organizations/:organizationId/finance/records`, through the
existing authenticated Next.js API bridge. Controllers delegate to the Finance
application service; clients never query the database.

| Method/path suffix | Purpose |
| --- | --- |
| GET `/` | Cursor page; kind, query, customer, Machine, branch and status filters |
| GET `/balances` | Approved gross/paid/remaining totals by currency, scoped across pages |
| GET `/branches` | Authorized active branch choices |
| GET `/:id` | Record, due items and payment/reversal history |
| POST `/` | Create a draft |
| PATCH `/:id` | Replace editable draft terms with version check |
| POST `/:id/confirm` | Validate and freeze terms/schedule |
| POST `/:id/cancel` | Cancel with version and reason, only without live payments |
| PATCH `/:id/document` | Audited document/reference correction |
| POST `/:id/payments` | Idempotent partial/full installment settlement |
| POST `/:id/payments/:paymentId/reverse` | Explicit payment reversal |

Writes reauthorize after the existing organization serialization lock and use a
serializable transaction. Approval checks that installment totals equal the gross
obligation. An empty draft schedule receives one due item on the transaction date;
leasing approval requires at least one installment. User-entered deposits are
separate due items, not extra charges added to the obligation.

Payment amount/currency, installment ownership and remaining balance are checked
server-side; concurrent attempts cannot both overpay. Identical idempotent retries
return the existing result; a reused key with different values conflicts. A reversal
does not free the original idempotency key. Payment dates cannot be in the future
in the organization timezone. Due dates are date-only; overdue means an approved,
unpaid due item strictly before today in that timezone.

Audit actions: FINANCE_RECORD_CREATED, FINANCE_RECORD_UPDATED,
FINANCE_RECORD_CONFIRMED, FINANCE_RECORD_CANCELLED, FINANCE_DOCUMENT_UPDATED,
FINANCE_PAYMENT_RECORDED and FINANCE_PAYMENT_REVERSED. Actors, organizations,
targets and timestamps are retained. No monetary/free-text content is copied into
audit metadata. Audit failure rolls back the complete operation.

## Web workflow and verification

Open `/finance/records` from Finance, a Customer's account link, a Machine's acquisition
payment-plan link or a Rental detail. Select the appropriate tab, create a draft,
choose explicit VAT/document terms, enter any due schedule, then approve. Record
partial payments against due items; remaining amounts and currency-separated account
balances are computed by the backend. Confirmed terms and payment history survive
reload. Customer/Rental debt is never silently prefilled from an ESTIMATE_V1 result.

EN/TR labels and TL/USD/EUR dropdowns are shared. Existing financial analytics retain
their original entered-amount basis and explicitly warn that these are not
VAT-normalized accounting results. Payments are not counted again as acquisition
costs, maintenance costs or rental estimates.

Automated coverage includes decimal VAT/rounding, legacy unknown VAT, explicit new
VAT validation, approval, partial payment, idempotency, concurrency, reversals,
leasing schedule sums, audit rollback, currency-separated balances, pagination,
database composite FKs, tenant/branch isolation and permission denial. Playwright
exercises actual forms through Next.js/API with isolated personas, including
receivables, invoice-reference correction, payments/reversals, leasing, open-account
non-applicable VAT, reload, hidden branches and financial redaction.

Run `pnpm db:migrate`, `pnpm db:seed`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`,
`pnpm typecheck`, `pnpm format:check` and `pnpm build`. No production Auth0 bypass or
real credentials are involved in browser automation.

## Explicit limits

No invoice issuance, tax filing/determination, statutory ledger, bank transfer,
bank reconciliation, automatic collection, customer credit/overpayments, exchange
rates, financing interest or depreciation. Recorded payments describe transactions
entered by authorized staff; they do not initiate or verify bank movements. VAT
non-applicability and document references require human verification outside this
application. Financial exports and automatic rental-to-debt conversion are deferred.

## Local verification (2026-11-19)

This records the initial operational-finance milestone. The [current workspace verification](19-E2E-TESTING.md#current-verification-baseline)
includes later duration-display and transportation regressions and distinguishes
local results from hosted GitHub evidence.

- Both additive migrations applied to the normal development database without a
  reset; existing acquisition/rental/maintenance amounts retain UNSPECIFIED VAT.
- Permission seed completed; existing administration-template roles have the six
  operational-finance permissions. No development receivables/payables were fabricated.
- 181 unit/integration tests and the full 53-scenario Playwright suite passed.
- Strict TypeScript, lint, formatting and full workspace build passed.
- Local PostgreSQL/TimescaleDB and Redis are healthy. E2E uses its disposable
  database and test identities; production Auth0 semantics remain unchanged.

After final payment-method label clarification, the eight operational-finance
browser scenarios passed again as part of the full 55-scenario local suite on
2026-11-24. These checks do not verify actual bank activity, fiscal invoice issuance
or tax applicability. Consult the central verification record for hosted CI status.
