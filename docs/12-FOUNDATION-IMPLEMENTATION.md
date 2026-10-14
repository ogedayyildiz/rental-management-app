# Database, access and audit foundation

This records implementation choices within the existing architecture and ADR-008.
It does not replace the architecture, domain, authorization or security documents.

## Persistence

`packages/database/prisma/schema.prisma` owns the schema. Prisma 7.10 uses its
PostgreSQL driver adapter against the existing PostgreSQL/TimescaleDB cluster.
Committed SQL migrations are applied with `pnpm db:migrate`. No hypertables or
other product domains are created in this phase.

- Organization stores tenant settings and activation state, with no owner or manager foreign key.
- User is global. ExternalIdentity maps an exact OIDC issuer/subject pair to a User.
  Multiple identities may map to one user. Email is contact data, not an authentication key.
- Membership is unique per organization/user and holds activation and branch scope.
- Role is tenant-owned and contains Permission grants through RolePermission.
  MembershipRole supports multiple roles. Optional templateKey is provenance only.
- Branch belongs to an organization. MembershipBranch lists selected branches.
- OrganizationInvitation stores intended roles and branches, sender, expiry,
  acceptance attribution and a token hash, never a plaintext invitation token.
- PlatformAccess, PlatformRole, PlatformAccessRole and PlatformRolePermission are
  separate from memberships and tenant roles. Permission scope is enforced by SQL
  checks and foreign keys. No tenant-facing role API can assign platform grants.
- AuditEvent preserves organization (nullable for platform/system events), actor,
  action, target type/ID, timestamp, result, source, request ID and JSON metadata.

All tenant association tables use composite foreign keys containing organizationId,
so a role/branch/invitation cannot be linked across tenant boundaries. Historical
references use restrictive deletion behavior. Timestamps use PostgreSQL timestamptz.
Audit UPDATE, DELETE and TRUNCATE are rejected by database triggers. Production
must use a non-owner application database role; database owners/superusers can
disable triggers and are outside this protection boundary.

## Authentication and trusted context

The provider-independent IdentityVerifier port accepts a bearer credential and
returns only a verified issuer/subject reference. Future adapters must validate
signature, trusted issuer, audience, expiry and applicable revocation rules. The
runtime implementation currently rejects all credentials. There is no development
header bypass, unsigned JWT decoding, password store or OIDC provider selection.

AuthenticationService maps verified identity to an active global User. It issues
an immutable backend principal tracked in a private WeakSet. Client-supplied user,
membership, permissions and branch IDs are never accepted as authority.

AccessService treats the requested organization ID as untrusted selection. It
loads an active membership, active user and active organization and derives grants
from enabled roles. Platform grants are never merged into tenant context. Contexts
are immutable, runtime-checked, per-operation values; do not cache or serialize
them as reusable authorization credentials. Changes take effect on the next
operation. Operations already in flight use their database transaction snapshot.

The global Nest guard requires authentication and an explicit permission policy
for protected controllers. Only health is public. Missing policy denies access.
Platform authorization has a separate service entry point; no platform HTTP
operations are exposed in this phase.

## Application and repository boundary

`GET /organizations/:organizationId/branches/:branchId` and `PATCH` at the same
path demonstrate the foundation using the documented `branches.manage` permission.
PATCH accepts only `{ "name": "..." }`. There is no branch creation UI/workflow.
Unauthorized IDs return a generic not-found result after membership checks.

Controllers delegate to BranchService. It re-resolves access inside a serializable
unit of work and uses explicitly scoped repository interfaces. Prisma repositories
apply organization and selected-branch filters to both reads and writes. Empty
selected-branch scope grants no branch access. Branch scope for future shared
records must be designed per domain, not copied indiscriminately.

Branch mutation and its audit record commit together. AuditService derives actor
and tenant from the trusted context, uses a server-generated request UUID and
allowlists before/after metadata. Audit failure rolls back the mutation. Metadata
must be extended deliberately for future actions; never store entire request
bodies, authentication headers, tokens or credentials. There are no audit edit,
delete or unrestricted read endpoints. The generic schema supports system actors;
additional action-specific writers belong with future implemented actions.

Serializable conflicts fail the operation without partial mutation or audit.
Automatic retry and idempotency policy are deferred until workflows require them.

## Validation and verification

`pnpm test` builds then runs bootstrap and foundation tests. Foundation tests create
a uniquely named disposable database on loopback PostgreSQL, apply all migrations,
exercise real repositories and HTTP guards, and drop only that database afterward.
The local development DB account therefore needs CREATEDB; no existing database
is reset or truncated. Tests refuse non-loopback hosts and do not silently skip
database security checks. No test authenticator is shipped in application source.

Negative coverage includes cross-tenant reads/writes, forged principal/header
values, inactive access, suspended organizations, role revocation, empty/selected
branch scope, platform/tenant separation, cross-tenant foreign keys, invalid input,
audit immutability and rollback when auditing fails.

## Assumptions and deferred workflows

- The draft auth document mentions custom roles as both current and future scope.
  Accepted ADR-008 and the current domain model govern: persistence supports custom
  tenant roles now, without fixed job-title authorization.
- Status enums implement the minimum documented active/inactive/suspended cases.
  Memberships and platform access default to no access; no seed grants access.
- Only four tenant administration permissions and three platform foundation
  permissions are seeded. No finance, remote control or other domain grants exist.
- No default role templates are instantiated before onboarding is implemented.
  Role and membership management commands are deferred, including last-admin
  protection, permission assignment limits and assigned-role disable safeguards.
  Persistence is not a substitute for those future application-service rules.
- Invitation sending/acceptance/revocation and identity linking are not implemented.
  Future acceptance must verify email ownership, consume tokens atomically, check
  expiry and role eligibility, preserve history and prevent duplicate memberships.
  Email alone must never silently link an OIDC identity to an existing user.
- Support impersonation, break-glass access, OIDC integration, production database
  role provisioning, rate limiting and security-event collection are not introduced
  by this phase. No provider has been selected and no new product domain is started.

No unresolved architecture decision was required for this foundation.
