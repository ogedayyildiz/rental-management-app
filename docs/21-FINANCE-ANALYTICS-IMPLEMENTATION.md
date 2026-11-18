# Finance / Analytics Phase 1

Read-only analytics in the NestJS modular monolith. The owner approved ESTIMATE_V1
on 2026-11-18. Existing Rental, Machine and Maintenance records remain authoritative;
calculated values are not stored back into those domains. Hosted verification of
the preceding system is recorded in [the E2E guide](19-E2E-TESTING.md#hosted-verification-2026-11-18).

## Confirmed boundaries

This phase is a read/analysis domain inside the modular monolith. Machine acquisition,
Rental commercial terms/assignments and Maintenance costs remain authoritative in their
existing domains. No parallel financial ledger, invoices, payments, tax engine or FX
rates are introduced. Canonical operating hours may enrich results but are optional.

Aggregate compatible currencies separately. Do not label rental value minus recorded
maintenance costs as net profit. Unknown acquisition costs and zero denominators must
not produce fabricated recovery percentages. Cancelled reservations are not realized
rental value; reservation, active and completed values require distinct definitions.

Documentation already identifies `finance.analytics.view` and `finance.analytics.export`
as dedicated aggregate permissions. Source-domain acquisition-cost, rental-pricing and
maintenance-cost view permissions must still restrict every corresponding total,
derived metric and export on the backend. Tenant/branch scope remains mandatory.

## ESTIMATE_V1 — approved operational estimation policy

The existing [Rental implementation](17-RENTAL-IMPLEMENTATION.md#pricing-and-permissions)
stores exact agreed rate strings, rate units, currencies and immutable term history.
It deliberately defines no duration rounding or totals formula. Supported units are
HOURLY, DAILY, WEEKLY, MONTHLY, FIXED_PERIOD and MANUAL.

[Rental business rules](07-RENTAL-BUSINESS-RULES.md#47-rental-pricing-after-extension)
also explicitly prohibit assuming `monthly_rate / 30 × days` without configured policy.
Therefore a rate and a duration alone cannot establish exact contracted/completed value.
This is a missing commercial policy, not a reason to change existing Rental history.

| Unit | Estimated units |
| --- | --- |
| HOURLY | Ceiling of elapsed milliseconds / 3,600,000 |
| DAILY | Ceiling of elapsed milliseconds / 86,400,000 |
| WEEKLY | Ceiling of elapsed milliseconds / 604,800,000 |
| MONTHLY | Ceiling of elapsed milliseconds / 2,592,000,000 |
| FIXED_PERIOD | Explicit agreed total line amount, once |
| MANUAL | Explicit manually priced total line amount, once |

No grace period. A month is **30 × 24 hours**, never a calendar month under this policy.
Time-based value is rate × rounded units × requested quantity. Fixed/manual totals
are multiplied by neither quantity nor duration. A date extension alone does not
increase them; an explicit Rental pricing edit is required.

| Rental state | Estimate |
| --- | --- |
| DRAFT, QUOTED, RESERVED | `estimatedContractedValue`: planned start → planned end |
| ACTIVE | Contracted comparison plus `estimatedAccruedValue`: actual start → server clock |
| COMPLETED | Contracted comparison plus `estimatedCompletedValue`: actual start → actual end |
| CANCELLED | Completed estimate zero; historical agreed terms remain readable |

`ACTIVE` is the existing on-rent enum; no competing status is introduced. Early/late
returns can lower/increase completed estimates. Zero time yields zero timed units;
fixed/manual amounts remain explicit totals. Missing/invalid dates or prices make
estimates unavailable, not zero-priced. Reports expose unavailable-line counts.

Calculations carry `valuationPolicy=ESTIMATE_V1`, stage and `valueType`:
CONTRACTED_ESTIMATE, ACCRUED_ESTIMATE, COMPLETED_ESTIMATE, FIXED or MANUAL.
Aggregates expose distinct contributing `valueTypes` alongside separate stage fields.
UI labels are Estimated Rental Value, Estimated Completed Rental Value and Estimated
Accrued Rental Value. Exact invoiced/billed revenue remains unavailable.

### Terms, assignments and period allocation

Unchanged adjacent extension terms merge before rounding. Explicit changed timed
terms retain their own date segments/rates; the first/last segment covers early/late
actual time beyond the planned window. Fixed/manual uses the latest explicit total.
An incompatible historical switch between fixed/manual and timed pricing or fixed
currencies has no conversion policy and is reported unavailable.

The initial estimate is a **line-window estimate**: earliest actual assignment start
through latest actual return (server clock for ACTIVE), with requested timed quantity
over that window. It is not per-machine partial-return billing. Replacements/partial
returns allocate that estimate in proportion to each physical machine's actual time,
without creating a second full line value. Contracted values allocate equally to
retained assignments; unassigned quantity is reported separately.

Ranges are half-open `[from,to)`. Report slices proportionally allocate whole estimates
by overlap; they do not round each month again. Fixed/manual estimates are spread over
their associated window for analytics, not as a payment schedule. Decimal arithmetic
uses 60 significant digits and six fractional output digits. The final assignment
receives the rounding residual, preserving whole-line totals. Separately requested
slices may differ at the sixth decimal place.

## Cost, contribution and acquisition recovery

All existing Maintenance cost kinds participate. Cancelled work orders are excluded.
Costs lack their own incurred timestamp, so reporting uses work-order completion time,
or creation time while open. Completion can therefore move the reporting period;
this is an operational approximation, not accounting recognition.

- Estimated contribution = completed rental estimate − recorded maintenance cost,
  per currency. It excludes acquisition, overhead, tax, financing and other unmodeled costs.
- Fleet capital baseline = known acquisition costs of currently ACTIVE lifecycle
  assets, grouped by original currency. It is not market/depreciated value.
- Lifetime recovery percentage = lifetime estimated contribution / acquisition cost × 100.
- Remaining amount = max(acquisition cost − lifetime contribution, 0).
- Simple recovered indicator = contribution ≥ positive acquisition cost.

Unknown cost, incompatible lifetime currencies or unavailable line estimates make
recovery unavailable. Zero cost has no percentage/remaining/recovered result. Negative
contribution is preserved. No payback-date forecast is invented. Lifetime runs through
report generation independently of the selected period. Rental-state/customer filters
omit lifetime recovery because filtered history cannot establish lifetime recovery.
An explicit branch filter or SELECTED_BRANCHES membership also omits lifetime
figures/recovery: restricted historical access cannot establish a complete lifetime.
Customer reports exclude unattributable acquisition/maintenance costs.

Currencies are never converted or summed together. Mixed results have separate rows
and an explicit flag. Monetary ranking requires one selected currency.

## Utilization and dates

Observation starts at max(period start, acquisition date or Machine creation) and
ends at min(period end, report clock). Currently SOLD/RETIRED machines are readable
but excluded from the denominator because authoritative lifecycle-end history is
unavailable. Excluded-machine counts are visible.

Actual time is the union of recorded assignment intervals, including replacements
and partial returns, clipped to observation. Cancelled rentals contribute none.
Reserved time is the union of retained, unstarted assignments in RESERVED/ACTIVE
rentals. Unassigned demand has no fabricated per-machine duration.

Utilization = actual rented time / calendar observation × 100. Unrented time =
observation − rented time. Unrented does **not** mean mechanically available/rentable;
service downtime is not subtracted from this calendar denominator. Customer/status
filters narrow the numerator. Average completed duration uses each completed rental's
earliest dispatch/latest return. Telemetry hours are a separate metric.

UTC elapsed milliseconds handle DST correctly. Presets use tenant-local calendar
boundaries: this month, previous month, year to date, current and preceding eleven
months through now. Custom offset timestamps allow at most 366 elapsed days. UI custom
inputs are labelled UTC; period display uses tenant timezone.

## APIs, permissions and isolation

`AnalyticsService` requires live trusted tenant context, `finance.analytics.view` and
`machines.read`. The approved PostgreSQL read projection uses organization/branch
filters inside Repeatable Read, with bounded bulk queries rather than per-machine SQL.

| Data | Additional permission |
| --- | --- |
| Acquisition values | `finance.acquisition_cost.view` |
| Rental counts/time | `rentals.read` |
| Rental estimates | `rentals.read` + `rentals.pricing.view` |
| Maintenance details | `maintenance.read` |
| Maintenance costs | `maintenance.read` + `maintenance.costs.view` |
| Contribution | Both pricing and maintenance-cost visibility |
| Recovery | Acquisition, pricing and maintenance-cost visibility |
| Customer grouping/filter | `customers.read` + `rentals.read` |
| XLSX | `finance.analytics.export`, plus every source/read check |
| Operating-hours enrichment | `telemetry.read` |

Missing financial grants remove source columns from SQL selects and corresponding
fields/derived values/export columns from responses. Rankings cannot infer hidden
pricing. PlatformAccess gives no tenant access. An additive migration grants the two
analytics permissions to TENANT_ADMINISTRATION templates/existing template-derived
roles with audit events. Read-only calculations do not emit business mutation audits.

Selected branches restrict Machines and both Work Order machine/responsible branches.
Rental access follows its conservative rule: responsible branch and all historically
assigned machine branches must be authorized. Filters cannot widen access. Branch,
model and category dimensions reflect current attributes, not historical snapshots.

`GET /organizations/:organizationId/finance` and `/finance/export` accept:
`preset`, `from`, `to`, `machineId`, `customerId`, `branchId`, `modelId`, `categoryId`,
`status`, `group` (machine/customer/model/category/branch), `sort`, `sortCurrency`,
`cursor`, `limit` (1–100, default 25), `locale` (en/tr).

Sorts: stable ID, descending completed estimate in one explicit currency, utilization,
or unrented time, with stable ID ties and cursor continuation. Summary/trends cover
all matches; detail and XLSX cover the current page. Source reads cap at 10,000 rows
per source collection and fail rather than truncate totals; narrow large reports by
machine/branch/model. This is a bounded initial read model, not a generic BI engine.

## UI, export and telemetry boundary

`/finance` has filters, cards, exact decimal tables, ranking, recovery, monthly ECharts
trends, paging and XLSX. Machine/Customer detail has performance panels and links.
English/Turkish follows shared translations. Charts convert to floating point only
for display coordinates; authoritative calculations, tables and monetary export cells
retain decimal strings.

XLSX uses the same redacted report contract. Metadata records policy, dates, timezone,
generation time and page scope. Financial columns disappear without grants. Strings
are plain cell values, never executable Excel formulas. No parallel report system/PDF.

Single-Machine reports optionally read canonical last-known operating hours through
the Telemetry application interface, with timestamp/stale marker. Finance works
without telemetry. Provider fields, real hardware and telemetry writes are excluded.

## Verification

Local verification on 2026-11-18: 138 unit/integration/security tests and all 25
Playwright scenarios passed without skips. The final Finance UI changes also passed
the focused seven-scenario run (six Finance cases plus the existing no-finance
persona regression). Lint, strict TypeScript, formatting and full workspace build,
including Next.js and Expo exports, passed. The additive migration/seed were applied;
PostgreSQL/TimescaleDB and Redis remained healthy. No development records were reset.

Unit/integration tests cover rate boundaries, DST, cancelled/active/early/late rentals,
extensions, fixed/manual, replacements/allocation, costs, zero/unknown acquisition,
currencies, utilization, recovery, paging/ranking and API/export permission denial.
Playwright uses isolated personas and January 2026 service-generated examples for
dashboard, period filters, machine/customer panels, exports and negative access.

Run `pnpm db:migrate`, `pnpm db:seed`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`,
`pnpm typecheck`, `pnpm format:check`, `pnpm build`. Development data is never reset.
Existing tests remain enabled. Auth0/provider, hardware and production ingress gates
remain separate; see [Telemetry](20-TELEMETRY-FOUNDATION.md) and [E2E](19-E2E-TESTING.md).
