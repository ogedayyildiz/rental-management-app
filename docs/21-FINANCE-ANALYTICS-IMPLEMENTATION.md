# Finance / Analytics Phase 1 preparation

**Status:** Requirements inspected; implementation pending pricing-policy clarification.
No Finance API, calculations, database migration, dashboard or exports have been implemented
by this preparation step. Hosted verification of the existing system is recorded in
[the E2E guide](19-E2E-TESTING.md#hosted-verification-2026-11-18).

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

## Decision required before financial calculations

The existing [Rental implementation](17-RENTAL-IMPLEMENTATION.md#pricing-and-permissions)
stores exact agreed rate strings, rate units, currencies and immutable term history.
It deliberately defines no duration rounding or totals formula. Supported units are
HOURLY, DAILY, WEEKLY, MONTHLY, FIXED_PERIOD and MANUAL.

[Rental business rules](07-RENTAL-BUSINESS-RULES.md#47-rental-pricing-after-extension)
also explicitly prohibit assuming `monthly_rate / 30 × days` without configured policy.
Therefore a rate and a duration alone cannot establish exact contracted/completed value.
This is a missing commercial policy, not a reason to change existing Rental history.

The owner has been asked to clarify:

- Partial-hour/day/week proration or rounding and any minimum charge.
- Thirty-day versus calendar-month pricing.
- Planned versus actual time for early/late returns.
- Whether FIXED_PERIOD and MANUAL represent per-unit totals, and how extension terms apply.
- Whether the initial UI may instead show explicitly labelled estimates under an approved
  policy while exact totals remain unavailable.

Machine-level allocation must also account for replacements and partial returns using
preserved assignment history. Reporting-period slices must not invent a different pricing
formula from lifetime totals. Once the policy is resolved, record exact formulas, policy
scope and historical reproducibility before implementing revenue-dependent metrics.

## Verification still required

Finance has no test pass claim yet. Implementation must add unit/integration and Playwright
coverage for rate units, period boundaries, cancellations, replacements, costs, utilization,
zero/unknown acquisition cost, mixed currencies, financial redaction, tenant/branch denial
and exports. The existing 111/19 baseline verifies the preceding domains only.
