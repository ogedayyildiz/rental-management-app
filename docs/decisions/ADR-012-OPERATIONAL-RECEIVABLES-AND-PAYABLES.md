# ADR-012: Own Operational Receivables, Acquisition Payables and Settlements

## Status

Accepted — owner-approved scope and policies, 2026-11-19.

## Context

Finance Phase 1 provides ESTIMATE_V1 analytics, not customer debt, VAT treatment
or cash movements. The owner now requires explicit VAT terms, cash/open-account/
leasing acquisition arrangements, manual installment schedules and customer
collections. The owner approved application-owned receivables and partial
collections, while leaving historical money with unspecified VAT.

## Decision

Add an operational Finance application module inside the existing modular monolith.
`FinanceRecord` represents a customer receivable or a Machine acquisition/financing
payable. Both share approved monetary terms, due installments and actual settlements.
Machine/Rental remain authoritative for their own acquisition/commercial terms;
Finance records are separately approved obligations, never implicit estimates.

Store VAT treatment independently of invoice/reference status. No invoice means
no recorded invoice, not proof of VAT exemption. The application records an explicit
rate or non-applicability explanation; it does not determine legal tax eligibility.

Draft records can be edited. Approval freezes terms and schedule. Payments and
collections carry idempotency keys and may be explicitly reversed with an audit
trail. Foreign organization/branch access, cross-currency settlement and overpayment
are rejected. No deletion of approved obligations or payment history is provided.

## Consequences

Customer operational balances and acquisition payment plans now belong to the
application. External accounting remains authoritative for issued fiscal invoices,
tax declarations, bank reconciliation and statutory ledgers. An optional invoice
reference is not invoice issuance or verification. Leasing means a manually entered
commitment/schedule; it adds no automatic interest or accounting depreciation.

ESTIMATE_V1 cannot create, settle or cancel receivables. Rental completion cannot
mark an account paid. Recording acquisition payments cannot double-count Machine
costs in analytics. Cross-currency netting, overpayments/customer credit and tax
filing are outside this first operational implementation.

## Related documents

- [Domain model](../03-DOMAIN-MODEL.md)
- [Finance principles](../09-FINANCE-ANALYTICS.md)
- [Finance Phase 1](../21-FINANCE-ANALYTICS-IMPLEMENTATION.md)
- [Operational finance implementation](../24-FINANCE-OPERATIONS-IMPLEMENTATION.md)
- [Permission-based authorization](ADR-008-PERMISSION-BASED-AUTHORIZATION.md)
