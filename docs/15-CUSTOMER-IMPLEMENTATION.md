# Customer implementation

Implemented 2026-10-17 within the existing modular monolith. This phase introduces
Customers only; it does not implement rentals, machines, finance or telemetry.

## Data and contracts

`Customer` belongs to exactly one Organization and has a generated immutable
`customerNumber` (`C-` plus UUID), COMPANY/INDIVIDUAL type, required display name,
optional legal name, tax office, identifier, primary email/phone and notes.
It retains active status, UTC timestamps and creator/updater User references.
Customer numbers are opaque identifiers, not sequential accounting numbers.

An optional identifier consists of all three fields: `identifierCountry`,
`identifierKind` (TAX or NATIONAL), and `identifierValue`. Country uses two uppercase
letters. Values are uppercased and spaces, dots and hyphens removed; the result
must contain 3–40 alphanumeric characters. Uniqueness includes organization,
country and kind, including inactive customers. These are generic format checks,
not country-specific legal/checksum validation. No identifier is mandatory merely
because a customer is a company or individual.

Contacts contain name, title, email, phone, notes, primary marker and active status.
Addresses contain BILLING, HEADQUARTERS, DELIVERY, SITE or OTHER type, label,
country code, region, city, district, postal code, line1/line2, notes, primary
marker and active status. Country code, city and line1 are required.
Billing addresses live here rather than in a competing Customer string field.
Country format is internationally usable; Turkey-specific identifier or postal
rules are not imposed on the core model.

Composite foreign keys `(organizationId, customerId)` prevent cross-tenant child
relationships. Database partial unique indexes allow one active primary contact
and one active primary address per type. Unmark an existing primary before choosing
another; no silent replacement occurs. A primary record must be active.
Each customer can retain at most 100 contacts and 100 addresses, including inactive
records. Child lists return all records within this bound in stable creation order.

Archiving sets `active=false`, preserves children and history, and is idempotent.
Inactive customers remain readable but cannot be edited, including child mutations.
There is no delete or restore endpoint in this phase. Child records are deactivated
through PATCH rather than deleted. Omitted PATCH fields are preserved; explicit
null clears nullable values. Shared Zod schemas reject unknown mutation fields.

## Access and application boundaries

The API resolves an active trusted tenant context and checks live permissions
inside each transaction. Customer records are organization-wide shared records
under the existing authorization rules, so branch scope does not restrict this
directory. Platform access alone confers no Customer access.

- `customers.read`: list, detail and child reads.
- `customers.create`: create a customer.
- `customers.update`: edit a customer and create/edit/deactivate its children.
- `customers.archive`: deactivate a customer.

With explicit project-owner approval, the additive migration grants these four
permissions to existing roles whose templateKey is TENANT_ADMINISTRATION and
records SYSTEM ROLE_PERMISSION_GRANTED audit events. New administration templates
include them as well. Runtime authorization still checks grants, never role names
or template keys. Platform permissions and tenant memberships are unchanged.

Thin Nest controllers call CustomerService. CustomerRepository and CustomerUnitOfWork
ports separate application behavior from the Prisma adapter. Serializable
transactions encompass live access checks, writes and audits. Database uniqueness
and serialization conflicts return 409; callers can reload and retry. There is no
automatic retry that could duplicate side effects.

Audit events cover customer creation/update/archive and contact/address creation
and updates, including deactivation and primary changes. They preserve actor,
organization, target, timestamp and request correlation. Customer audit metadata
does not duplicate names, identifiers, contact details or notes. Audit failure rolls
back the mutation. Internal phone-search columns are omitted from API responses.

## HTTP API

All routes below start with `/organizations/:organizationId/customers` and require
the existing authenticated API principal.

| Method | Suffix | Operation |
| --- | --- | --- |
| GET | / | Search/list |
| POST | / | Create |
| GET | /:customerId | Detail |
| PATCH | /:customerId | Edit |
| POST | /:customerId/archive | Archive |
| GET / POST | /:customerId/contacts | List/create contact |
| PATCH | /:customerId/contacts/:contactId | Edit/deactivate contact |
| GET / POST | /:customerId/addresses | List/create address |
| PATCH | /:customerId/addresses/:addressId | Edit/deactivate address |

List query fields: `q` (up to 100 characters), `status` (ACTIVE default, INACTIVE,
ALL), `limit` (25 default, maximum 100), and optional `cursor`. Search covers
display/legal names, customer number, identifier, customer/contact email and phone,
and contact name. Phone matching ignores formatting. Keyset pagination orders by
createdAt then id descending; the returned nextCursor should be passed unchanged
with the same filters. No expensive total-count query is included. Organization
indexes bound the initial search workload; specialized search indexing can be
evaluated from measured load later.

Responses use shared `@rental/validation` DTOs with ISO timestamps.
`@rental/api-client` exposes a transport-injectable client usable by mobile later.
The web server bridge allowlists Customer methods/paths, preserves query strings,
checks mutation origins and retains Auth0 access tokens server-side.

## Web and verification

`/customers` supports organization selection, search, status filtering, cursor
navigation, creation, details, editing, archive, contacts and addresses. Controls
follow permissions; backend enforcement remains authoritative. English and Turkish
text uses shared translation keys. No mobile Customer-management screen was added.

The Rental Create/Edit screen also reuses this Customer form and creation API.
It requires customers.create, retains the rental draft, prefills the customer name
from search text and selects the successfully created Customer immediately.
Creation remains an independent audited Customer transaction; abandoning the
rental does not delete the Customer. Customer lookup still requires customers.read
and returns active same-tenant results via listActive, including an empty search.
See [Rental implementation](17-RENTAL-IMPLEMENTATION.md#create-a-customer-while-preparing-a-rental).

Run `pnpm db:migrate`, `pnpm db:seed`, `pnpm test`, `pnpm lint`,
`pnpm typecheck`, `pnpm format:check`, and `pnpm build`.
Tests cover HTTP authorization, tenant and parent substitution, identifier conflicts,
concurrent writes, contacts/addresses, search/pagination, inactive behavior, audit
rollback and shared contracts. Automated tests use isolated database fixtures.
Real authenticated browser acceptance of the new Customer UI remains a separate
manual check: sign in as the tenant user, open `/customers`, and exercise the
create/edit/contact/address/archive flow. The platform-only operator should see no
accessible Customer organization.

## Development data

The empty duplicate UM Kiralama organization
`8bcc3fd1-7b33-4426-8891-518a3a53a9c4` was inspected. Its pending initial invitation
was left unchanged because an authenticated operator browser session was not
available to use the existing authorized revocation endpoint. No cleanup endpoint,
membership bypass, deletion or direct database revocation was introduced. It remains
development test data. Like all existing administration templates, its unassigned
template received the explicitly approved Customer permission extension.

## Related documents

- [Domain model](03-DOMAIN-MODEL.md)
- [Authorization](05-AUTH-AND-PERMISSIONS.md)
- [Security](10-SECURITY.md)
- [Coding standards](11-CODING-STANDARDS.md)
- [Permission-based authorization ADR](decisions/ADR-008-PERMISSION-BASED-AUTHORIZATION.md)

No architecture change or new ADR was required.
