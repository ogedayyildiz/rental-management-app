# Organization administration / tenant settings

This phase makes the existing authorization records manageable through the modular
monolith and Next.js UI. Auth0 still verifies identity; every operation resolves fresh
database membership and enabled-role grants. No provider roles, platform-to-tenant
fallback, impersonation endpoint, mobile administration or new business domain is added.

## Approved administration policy

An organization must retain at least one ACTIVE Membership attached to an ACTIVE User
with ALL_BRANCHES scope whose **enabled roles collectively** grant
`organization.manage`, `users.manage`, `roles.manage` and `branches.manage`.
No role name or template key determines this capability. This floor preserves administration,
not every financial grant: removing the last holder of a permission also removes the
ability to delegate it through this UI. There is no tenant recovery bypass. New organizations may have
zero members while their initial invitation is pending; the provisioning flow is unchanged.

Organization settings, roles, memberships, invitations and audit reads require
ALL_BRANCHES plus the applicable permission. Membership mutation requires both
`users.manage` and `roles.manage`. Existing selected-branch business access and scoped
branch read/edit are preserved. Branch creation requires ALL_BRANCHES.

An actor cannot grant permissions they do not hold, or modify a role/member whose
current role grants exceed the actor's permissions. Disabled roles cannot be assigned
to active members. Tenant roles accept only registered tenant permissions; platform
permissions and arbitrary keys are rejected, including direct HTTP requests.

Disabling a role is rejected while any membership references it (including inactive
memberships), or while a pending unexpired invitation references it. Reassign/remove
membership roles and revoke pending invitations first. Disabling unused custom or
template-derived roles is allowed; templates are provenance, not protected identities.

Role and membership mutations run in Serializable transactions under an organization
row lock. After a mutation, the remaining administrative capability is checked in the
same transaction. Conflicting concurrent removals cannot both commit. Settings, roles
and memberships require the last-read `updatedAt` as `version`; stale versions and
serialization conflicts return 409. Last-admin removal returns `ADMIN_LOCKOUT`; assigned
role disabling returns `ROLE_IN_USE`. Failed audits roll back the entire change.

## Organization and membership lifecycle

Editable settings are the existing name, legalName, country (ISO-style two-letter
code), defaultCurrency (three-letter code), defaultLanguage (`en`/`tr`) and IANA timezone.
Changing defaults does not rewrite historical money, currencies, dates or contracts.
Tenant APIs cannot suspend organizations or change their IDs.

Memberships can be activated/deactivated, receive multiple roles, or change branch scope.
Deactivation preserves historical associations and immediately removes tenant access
on subsequent requests. Tenant administrators cannot edit global User status, identity
records, passwords or Auth0 credentials. Reactivating membership cannot reactivate a
disabled global User. Invitations never overwrite an existing membership.

ALL_BRANCHES stores no branch IDs. SELECTED_BRANCHES can have zero IDs (no branch
access); the UI warns about this explicitly. Roles and branch IDs must belong to the
same organization, backed by the existing composite foreign keys. New branch grants
and reactivation validate active branches. Unchanged historical scope may be retained
when deactivating a membership.

## Branches and historical records

Branches support name and active state only. No hard deletion is exposed. Deactivation
preserves Machines, Rentals, Maintenance, DeviceInstallation, analytics, membership
scope and all historical references. Existing selected-branch members retain access
to historical records in that scope. Existing domain rules reject inactive destinations
for new assignments. Reassignment to a different branch remains an explicit domain
operation; deactivation does not move assets or rewrite history.

Branch edits reuse the existing scoped PATCH endpoint and transactional BRANCH_UPDATED
audit, including before/after active state when supplied. ALL_BRANCHES users can list
all organization branches; selected-branch users with branches.manage see/edit only
their permitted branches. No filter broadens scope.

## Invitations

The new list/UI reuses the existing creation/revocation endpoints and acceptance flow.
The invitation response exposes the random token once to the authorized inviter. The
password-style field can be selected/copied for private delivery, and is cleared on
reload, navigation and organization switch. No token is added to a URL or audit event.
Only the hash is stored. Lists return role/branch assignments, timestamps and status,
never token/hash fields. Expired PENDING records display as EXPIRED based on server time.

No automatic email provider is introduced. Deliver the token privately; the invitee
signs in with their verified invited email and uses Accept invitation on the home page.
Lost tokens are replaced by revoking the pending invitation and creating a new one.
Accepted invitations cannot be reused or revoked to remove membership. Existing
transactional acceptance, issuer+subject identity mapping, verified email checks and
single-use guarantees remain authoritative.

## Permissions and finance

The role editor obtains its permission catalog from the backend. It shows translated
descriptions, technical keys and an explicit financial marker. Every financial permission
is individually selectable; no operational preset silently adds pricing, acquisition,
maintenance-cost or analytics grants. Platform permissions are absent from this catalog.

`audit.read` is the only new permission. The additive migration grants it to roles
originating from TENANT_ADMINISTRATION, with system audit events. New administration
templates include it. Other role grants remain unchanged.

Authorization is not cached in Auth0 tokens or frontend context. Role edits, membership
deactivation and scope changes affect subsequent API requests immediately, including
financial response redaction and exports. The frontend refreshes its context after
role/member edits; other sessions may refresh their context to update navigation, but
the backend never relies on that refresh for enforcement.

## API contracts

All paths below begin `/organizations/:organizationId`. Controllers delegate to the
AdministrationService/repository boundary; branch and invitation writes reuse their
existing services. Shared strict Zod contracts reject unknown mutation fields.

| Method/path | Permission (plus scope described above) |
| --- | --- |
| GET/PATCH `settings` | organization.manage |
| GET `permissions` | roles.manage |
| GET/POST `roles`, PATCH `roles/:id` | roles.manage |
| GET `memberships`, GET `memberships/:id` | users.manage |
| PATCH `memberships/:id` | users.manage and roles.manage |
| GET/POST `branches`, GET/PATCH `branches/:id` | branches.manage |
| GET `invitations`, POST `invitations/:id/revoke` | users.manage |
| POST `invitations` | users.manage and roles.manage |
| GET `audit` | audit.read |

List responses are `{items,nextCursor}` with default 25, maximum 100. Roles, members,
branches and invitations use stable ID keysets and optional `q`; members additionally
support status/roleId/branchId filters, invitations status. Audit uses descending
timestamp/ID keysets and optional UTC `from` (inclusive), `to` (exclusive), actorId,
action, targetType and domain. A foreign or mismatched audit cursor is rejected.
Tenant queries always contain organization scope; unauthorized organization context
returns 403 and inaccessible resource IDs return 404.

## Audit UI and privacy

The immutable audit page shows actor, organization-scoped events, action, target,
timestamp, result and reviewed changed-field names. It never returns arbitrary raw
metadata, before/after financial values, credentials, invitation hashes or tokens.
Metadata for administration mutations records bounded identifiers, permission keys,
role/branch assignments and status changes; company names/emails are not copied into it.
Other domains' metadata is deliberately not exposed through this general audit reader.

Audit actions include ORGANIZATION_SETTINGS_CHANGED, ROLE_CREATED, ROLE_CHANGED,
MEMBERSHIP_CHANGED and BRANCH_CREATED, plus existing BRANCH_UPDATED and invitation
events. A single membership/role event records the changed fields and before/after
authorization assignments rather than emitting misleading independent operations.

## Web context and navigation

Routes: `/settings`, `/settings/organization`, `/settings/users`, `/settings/roles`,
`/settings/branches`, `/settings/invitations`, `/settings/audit`.
English/Turkish translations use the shared i18n package. Status/access mutations
require a confirmation checkbox. Role names are unique within an organization.

The account area shows the signed-in user, memberships, selected organization's branch
scope and effective permissions. Organization selection is a UI hint validated against
fresh `/me` memberships; it never creates authorization. Switching remounts the tenant
panel, clears editors/results/cursors/invitation tokens and ignores late previous-panel
responses. Navigation to business lists carries only the selected organization ID,
never an old customer/machine/rental ID. Each API request revalidates membership.
Platform-only users see no tenant administration and receive no implicit tenant grants.

## Verification and boundaries

Integration tests cover settings, strict validation, optimistic versions, role ceilings,
assigned-role protection, live permissions, cross-tenant references, collective and
concurrent last-admin protection, scoped branches, disabled users, invitation listing,
audit rollback/redaction/filtering/pagination and HTTP financial omission.

Playwright covers the actual settings forms, operational roles without financial grants,
member role/scope/status changes, immediate API denial, branch lifecycle, manual
invitation issuance/revocation, lockout feedback, filtered audits, platform/foreign/selected
branch denial and safe multi-organization switching. It uses isolated personas only.
Run `pnpm test:e2e --grep administration` for focused verification, or `pnpm test:e2e`
for the cross-domain suite. The normal test, lint, typecheck, format and build checks apply.

Manual/external boundaries remain Auth0 login/MFA/email delivery, real provider telemetry
and production deployment. This phase does not change them or add a new bypass.

Related: [Authorization](05-AUTH-AND-PERMISSIONS.md),
[Security](10-SECURITY.md), [Onboarding](13-AUTHENTICATION-AND-ONBOARDING.md),
[E2E testing](19-E2E-TESTING.md),
[ADR-008](decisions/ADR-008-PERMISSION-BASED-AUTHORIZATION.md).
