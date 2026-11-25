# ADR-011: Use Managed Auth0 Behind the Application Identity Boundary

## Status

Accepted — managed Auth0 selected. Authentication and organization onboarding were subsequently authorized as a separate implementation phase.

Evaluation completed: 2026-10-14. Provider documentation and pricing were consulted on 2026-10-13–14. Commercial terms and product capabilities must be rechecked before procurement.

## Context

The platform is a multi-tenant rental SaaS developed initially by a very small team. It has Next.js web, React Native with Expo mobile, and a NestJS modular-monolith backend. Customers may operate in Türkiye and Europe. Authentication must support future MFA, enterprise federation, and service-to-service use without transferring business authorization to an identity vendor.

The existing foundation already provides the required boundary:

- `User` is global and has no authoritative organization ID.
- `ExternalIdentity` maps unique `issuer + subject` to `userId`; a user may have multiple identities. Email is contact information.
- `IdentityVerifier` returns a verified issuer and subject. `AuthenticationService` resolves an existing active application user through that pair.
- `AccessService` validates active membership and organization status before creating trusted tenant context. Permissions and branch restrictions come from the database.
- Platform permissions are resolved separately through `PlatformAccess`.
- The currently configured verifier rejects every credential until an adapter is implemented.

Inspection found no conflict between these boundaries and this decision. Unknown external identities remain denied by the existing authentication service; provisioning, invitations, and linking require separately reviewed workflows.

## Requirements

1. Use OIDC/OAuth 2.0 authorization code flows with PKCE and hosted authentication.
2. Support web sessions, native mobile redirects, API access tokens, MFA, recovery, verified email, and future passkeys/social login.
3. Keep provider operations manageable without a dedicated identity infrastructure team.
4. Preserve application ownership of organizations, memberships, tenant roles, permissions, branches, platform access, and business authorization.
5. Map identities only through verified issuer and subject. Never link accounts merely because email addresses match, including verified addresses.
6. Preserve tenant isolation and the separation of tenant and platform privileges regardless of provider claims.
7. Offer an acceptable hosting region, contractual security commitments, growth cost, and migration path.

## Options Considered

- **Auth0 managed cloud:** selected; use hosted Universal Login and standard OIDC at the backend boundary.
- **ZITADEL Cloud:** strongest alternative; managed operation with a self-hosted route if requirements change.
- **Keycloak:** technically suitable, evaluated primarily as self-hosted upstream software. Third-party managed Keycloak would require a separate supplier and commercial evaluation.

No additional candidate is needed to resolve this decision: these options cover managed proprietary, managed with self-hosting availability, and independently operated identity infrastructure.

## Comparison

Entries describe documented capabilities unless marked **judgment**. Capability availability is not a promise that every subscription includes it. References are official documentation; no production integration or performance benchmark was performed.

| Criterion | Auth0 | ZITADEL | Keycloak |
| --- | --- | --- | --- |
| OIDC / OAuth 2.0 | Standards-based authorization code, PKCE, discovery and JWT validation. [A1][A2] | OIDC discovery, PKCE, JWT/opaque token support. [Z1] | OIDC/OAuth endpoints, PKCE and discovery. [K1] |
| Next.js | Dedicated first-party SDK, including current Next.js routing guidance. [A2] | Official Next.js example using standard client libraries. [Z2] | Standard OIDC integration; no dedicated Next.js SDK in the reviewed adapter catalog. [K2] |
| React Native / Expo | First-party React Native SDK and Expo configuration plugin; development build required, not Expo Go. [A3] | Standard native OIDC integration; no dedicated Expo SDK listed in the reviewed catalog. [Z3] | Native AppAuth options; Expo integration through standard OIDC tooling. [K2] |
| NestJS access tokens | Validate API JWT with trusted issuer, JWKS, audience and claims in an adapter. [A1] | JWT validation or authenticated introspection. [Z1] | JWT validation or authenticated introspection. [K1] |
| MFA | Multiple factors; entitlements vary by plan. [A4] | TOTP and other factors, including WebAuthn. [Z4] | OTP and WebAuthn authentication flows. [K3] |
| Password reset / recovery | Hosted reset flow; recovery policy still needs configuration. [A5] | Hosted reset and self-service recovery. [Z4] | Reset credentials and recovery-code flows. [K3] |
| Email verification | Built-in verification flows. [A6] | Hosted verification. [Z4] | Verify-email required action. [K3] |
| Passkeys / WebAuthn | Database-connection passkeys; validate chosen login configuration. [A7] | FIDO2/passkeys. [Z4] | WebAuthn/passwordless/passkeys. [K3] |
| Future social login | Social connections. [A8] | External identity-provider integration. [Z4] | Social identity brokering. [K3] |
| SaaS suitability | Shared identity directory can serve our application tenants. **Judgment:** good fit without Auth0 Organizations. | Projects/organizations available. **Judgment:** good fit without synchronizing our authorization model. | Realms/organizations available. **Judgment:** good fit without a realm per rental company. [K3] |
| Organization-model conflict | Avoid adopting provider Organizations as authoritative application tenants. | Avoid coupling provider organization/project grants to memberships. | Avoid treating realm roles or provider organizations as application access. |
| M2M / service accounts | Client credentials; token allowances and add-ons matter. [A9][A10] | Service accounts and machine authentication. [Z5] | Client credentials/service accounts. [K1] |
| Platform administrators | Human authentication only; our `PlatformAccess` grants application authority. | Same separation required. | Same separation required. |
| Sessions | SDK application session plus provider session. [A2] | Hosted login and OIDC session lifecycle. [Z1][Z2] | SSO/client sessions and configurable timeouts. [K3] |
| Logout / revocation | Logout support and session/refresh-token revocation APIs; advanced features are plan-dependent. [A2][A11][A10] | End-session, revocation and introspection endpoints. [Z1] | Logout, revocation and introspection endpoints. [K1] |
| Security maturity | Managed identity service with documented validation/MFA controls. **Judgment:** strong fit; supplier assurance review still required. [A1][A4] | Documented security controls and managed operating responsibilities. **Judgment:** credible alternative. [Z4][Z6] | Established project with extensive security configuration. **Judgment:** outcomes depend heavily on our operations. [K3][K4] |
| Managed cloud | Vendor-operated public/private cloud. [A12] | Vendor-operated Cloud. [Z6] | No upstream-operated SaaS selected here; third-party offerings need separate assessment. |
| Self-hosting | No ordinary self-hosted software distribution; private cloud is not equivalent. [A12] | Available; current community/commercial licensing must be reviewed. [Z7] | Available under Apache 2.0. [K5] |
| Operational burden | **Judgment:** lowest combined integration/operations burden for this stack. | **Judgment:** low with Cloud; somewhat more native integration ownership. | **Judgment:** highest; patching, database, backups, HA and incident response remain ours. [K4] |
| Scalability | Managed capacity, subject to contracted limits. [A12] | Managed capacity or self-hosted scaling. [Z6] | Scalable clustered deployment; capacity and failover require engineering. [K4] |
| EU / Türkiye residency | Europe public-cloud option; exact contractual scope must be confirmed. [A12] | EU region available; other advertised regions include Switzerland, which is not EU. [Z6] | Deployment location controlled by operator. [K4] |
| Lock-in | **Judgment:** highest commercial dependency; proprietary SDK/session and management APIs. | **Judgment:** moderate; proprietary management APIs and deployment/license dependencies remain. | **Judgment:** lower supplier dependency, but realm configuration/extensions create migration work. |
| Pricing / growth | MAU/feature-tier model plus machine-token considerations. [A10] | Base subscription with DAU and additional usage dimensions. [Z8] | No upstream per-user license charge; infrastructure and staff cost dominate. [K5] |
| Developer experience | **Judgment:** strongest direct fit for this small team's two clients. | **Judgment:** good standards-oriented experience; native flow needs more validation. | **Judgment:** flexible but more configuration and operational expertise required. |
| Documentation / SDKs | Focused first-party Next.js and React Native repositories. [A2][A3] | Official examples and catalog distinguish integrations. [Z2][Z3] | Comprehensive server/protocol documentation and adapter catalog. [K1][K2][K3] |

Standards support does not mean every optional specification, logout behavior, or SDK combination is interchangeable. All three require integration tests. Offline JWT verification alone cannot detect immediate provider-side revocation.

### Pricing and growth assumptions

**Changing commercial facts:** Auth0's public page has B2C/B2B and billing selectors. The default B2C monthly view inspected advertised Free up to 25,000 MAU, Essentials at $35/month for 500 MAU, and Professional at $240/month for 500 MAU. These are **not a quote or confirmed packaging eligibility for this rental SaaS**. MFA factors, environment counts, machine-token allowances, support, and back-channel logout have tier restrictions. Obtain applicable B2B/commercial terms rather than budgeting from the free headline. [A10]

ZITADEL's published Cloud Pro model starts at $100/month with 25,000 DAU, three active external identity providers and 500,000 management API requests included. Additional usage, administrators, domains and support/SLA can change the bill. The free tier lists 100 DAU. Confirm the billing definition of DAU and overage units; it is not equivalent to MAU. [Z8]

Keycloak's license does not impose a per-active-user subscription, but production cost includes compute, database, backups, monitoring, upgrades, recovery exercises and on-call ownership. A supported distribution or managed supplier adds its own terms. [K4][K5]

**Project assumptions, not forecasts:** compare quotes at 500, 5,000 and 20,000 MAU, using measured daily activity for ZITADEL. Include three environments, required MFA factors, custom domain, email/SMS delivery, support, future enterprise SSO connections and projected machine-token issuance. Customer-organization count is not automatically provider-organization count. Auth0 may become materially more expensive as these requirements grow; ZITADEL may offer better economics. No reliable growth total is asserted without these inputs.

## Decision

Select **Auth0 managed public cloud, with an EU hosting region preferred**, behind the existing `IdentityVerifier` boundary. Use hosted login and separate web/native application registrations per environment, with an explicit backend API audience.

The exact subscription and region are procurement gates, not settled by this ADR. If cost or residency cannot meet the project's requirements, reconsider this selection before implementation; ZITADEL Cloud is the first alternative to evaluate.

Do not adopt Auth0 Organizations, provider role names, provider RBAC/FGA, or provider-side business rules as the application's authorization system. An Auth0 tenant is an identity-service environment, not a rental-company `Organization`. Keep development, staging and production identity configuration separate.

## Reasons

The deciding factor is the combination of managed operation and direct first-party support for both Next.js and React Native/Expo. This reduces integration ownership and identity-server maintenance for a very small team while the existing application boundary limits authorization lock-in. The decision does not depend on provider organizations, a free tier, or having the largest feature list.

The repository uses Next.js 16, Expo 57, React 19 and React Native 0.86. Auth0's SDK documentation provides a relevant integration path, but documentation alone does not establish compatibility with our exact versions. A later integration must verify native redirects, refresh, logout and recovery on both iOS and Android development/production builds. [A2][A3]

**Strongest reason against ZITADEL Cloud:** relative to Auth0, the reviewed materials leave more responsibility with this team for a supported Expo/native integration path and its lifecycle tests. It is not rejected for lacking managed hosting or essential authentication features. Its hosting flexibility and published economics make it a serious fallback, and a successful native proof of concept plus a substantially better quote could reverse the choice.

**Strongest reason against Keycloak:** operating a security-critical identity server reliably is disproportionate to the current team's capacity. Its functionality and independence are attractive, but there is no identified owner for upgrades, recovery, availability and incident response.

**Strongest reason against the selected option:** commercial dependence and potentially expensive feature/usage tiers. The team accepts this tradeoff provisionally for reduced delivery and operational burden, subject to an explicit budget review.

## Architecture

```text
OIDC Provider (Auth0)
      |
      v
IdentityVerifier adapter (validates API access token)
      |
      v
verified issuer + subject
      |
      v
ExternalIdentity -> global User
                         |
              +----------+-----------+
              |                      |
              v                      v
         Membership             PlatformAccess
              |                      |
       tenant context           platform permissions
       permissions / branches
```

Auth0 owns authentication, credentials, MFA, recovery, email verification, token issuance and identity sessions. PostgreSQL and the backend remain authoritative for all business access. Provider organization, role and group claims cannot create memberships or grant permissions.

The intended web flow uses hosted authorization code with PKCE and a secure, HTTP-only application session. Server-side web integration forwards an API-audience access token to NestJS; it does not replace backend authorization. Mobile uses a public client, system browser, PKCE, registered redirects and operating-system-protected credential storage. No client secret belongs in the mobile app.

The adapter validates signature, allowed algorithms, exact trusted issuer, intended audience, token validity and appropriate client/token-use constraints before returning `issuer + subject`. Trust configuration is server-controlled; arbitrary token issuer URLs must not drive key discovery. ID tokens and upstream social-provider access tokens are not accepted as this API's access tokens. Provider SDK types stay outside domain/application contracts.

`AuthenticationService` continues resolving an existing active user. A frontend organization selection is only a request: the backend must load and validate its membership and enforce branch/resource scope. Platform administrators authenticate as people but receive authority only through application platform grants; provider-console administrators do not automatically receive application access.

Future M2M authentication uses the provider's machine credentials but needs an explicitly designed machine-principal authorization boundary. Do not map a client-credentials subject to a human `User` or grant tenant access implicitly. This ADR selects provider capability, not a service-account implementation.

## Security Considerations

- Preserve exact verified issuer/subject matching. Neither email nor `email_verified` establishes identity ownership or membership. Linking requires proof of control of both identities and an audited application workflow; disable unsafe email-only linking in provider customizations too.
- Use exact redirect/logout allowlists, state/nonce checks as applicable, PKCE, TLS, secure cookies and CSRF protection. Validate native links and browser return behavior on real builds.
- Keep token lifetimes bounded and rotate refresh tokens where appropriate. Local application logout, provider-session logout, refresh-token revocation and upstream social logout are distinct operations. Specify and test each intended behavior; do not claim logout instantly invalidates every previously issued JWT.
- Define acceptable revocation delay before implementation. Provider session revocation exists, but the application's session and independently validated access tokens need coordinated handling. Active-user/membership checks remain essential for application suspension. [A11]
- Require strong MFA for identity-console operators and establish a platform-admin MFA policy before production. Recovery must not become a weaker bypass. Future action-specific step-up needs verified authentication assurance/recency; the current issuer/subject-only contract does not expose that evidence. Review that boundary explicitly when step-up is introduced, without changing it in this phase.
- Separate environments and secret access. Never log passwords, tokens or authentication headers. Provider login logs complement application audit events; they do not replace business audit history. Confirm retention/export entitlements and redaction.
- Managed hosting does not remove configuration, dependency-update, account-recovery, abuse-protection or incident responsibilities. Validate supplier security evidence and operational commitments before production; this comparison is not a security audit.
- EU hosting is a preference, not a legal-compliance conclusion. Confirm processing locations for identity data, logs, backups, support and subprocessors, plus applicable contractual transfer requirements. No Türkiye-resident managed deployment is assumed for either cloud provider. A strict Türkiye-only requirement reopens the decision before customer identity data is sent.

## Consequences

Positive:

- No new identity server or identity database must be operated by this team.
- Web/mobile authentication can use maintained provider integrations while the backend preserves its existing domain model.
- Tenant and platform authorization remain independently testable and portable.

Negative:

- Availability and pricing depend on a supplier; rate limits and paid features constrain implementation choices.
- Expo authentication needs a development/production build workflow, not only Expo Go.
- Session coordination, recovery policy, provisioning and account linking still require application design and tests.
- Migration of credentials, MFA enrollments and identities is materially harder than replacing token-validation code.

No SDK, login route, schema, migration, invitation flow, environment setting or product-domain implementation is added by this decision.

## Vendor-Lock-In Mitigation

Keep protocol verification inside the adapter and preserve the current `ExternalIdentity` mapping. Keep memberships, role templates, permissions and platform grants exclusively in our database. Avoid proprietary business logic in Actions, provider authorization services, organization claims or frontend SDK sessions.

Keep vendor management operations behind dedicated integration boundaries when required. Record issuer/client/audience configuration and logout assumptions; test invalid issuer/audience, expired tokens, unknown identities, cross-tenant requests and platform/tenant separation independently of the SDK.

Choose the login domain before registering passkeys. A custom domain may reduce user-facing disruption but does not make issuers, subjects, keys or credentials portable. A provider migration must explicitly verify and map new identities; never bulk-link by email. Establish export rights and limitations in advance. Password resets or MFA/passkey re-enrollment may be necessary; existing application IDs and audit history must survive migration.

## Reconsideration Criteria

Reopen this ADR if:

- applicable pricing exceeds the approved growth budget or essential MFA/session capabilities require an unacceptable tier;
- residency, sovereignty, contractual or customer requirements cannot be met;
- native integration proves unreliable with supported project versions;
- provider reliability, support or security commitments become inadequate;
- enterprise federation or machine-token volume substantially changes costs;
- the team acquires dedicated identity operations capacity or self-hosting becomes a firm requirement;
- ZITADEL's validated integration and commercial terms offer a materially better total cost without extra delivery risk.

### Questions before implementation

1. What are the expected MAU/DAU, enterprise SSO connections, machine-token volume and monthly budget at launch and growth milestones?
2. Which Auth0 packaging and MFA/session/support entitlements apply, and what written quote covers all three environments?
3. Is EU processing acceptable, or do any customers require Türkiye-only residency? Which DPA, subprocessors and transfer conditions are acceptable?
4. Which login domain, mobile identifiers, callback URLs and deployment origins will be used?
5. What are the required MFA factors, recovery policy, session lifetimes, revocation delay and initial platform-admin enrollment procedure?
6. What separately approved onboarding/provisioning and identity-linking workflow will connect a new verified identity to an application user? Authentication alone must not create membership.

## Related Documents

- [AGENTS.md](../../AGENTS.md)
- [README.md](../../README.md)
- [System architecture](../02-SYSTEM-ARCHITECTURE.md)
- [Domain model](../03-DOMAIN-MODEL.md)
- [Authentication and permissions](../05-AUTH-AND-PERMISSIONS.md)
- [Security](../10-SECURITY.md)
- [Coding standards](../11-CODING-STANDARDS.md)
- [ADR-008: Permission-based authorization](ADR-008-PERMISSION-BASED-AUTHORIZATION.md)
- [Foundation implementation](../12-FOUNDATION-IMPLEMENTATION.md)

### Official provider references

These references substantiate provider capabilities; the selection, burden estimates and architectural constraints above are project judgments.

[A1]: https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens
[A2]: https://github.com/auth0/nextjs-auth0
[A3]: https://github.com/auth0/react-native-auth0
[A4]: https://auth0.com/docs/secure/multi-factor-authentication
[A5]: https://github.com/auth0/docs/blob/master/articles/connections/database/password-change.md
[A6]: https://auth0.com/docs/manage-users/user-accounts/verify-emails
[A7]: https://auth0.com/docs/authenticate/database-connections/passkeys
[A8]: https://auth0.com/docs/authenticate/identity-providers/social-identity-providers
[A9]: https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow
[A10]: https://auth0.com/pricing
[A11]: https://auth0.com/docs/api/management/v2/sessions/revoke-session
[A12]: https://auth0.com/platform/cloud-deployment
[Z1]: https://zitadel.com/docs/apis/openidoauth/endpoints
[Z2]: https://zitadel.com/docs/sdk-examples/nextjs
[Z3]: https://zitadel.com/docs/sdk-examples/introduction
[Z4]: https://zitadel.com/docs/guides/integrate/login/hosted-login
[Z5]: https://zitadel.com/docs/guides/manage/console/users-overview
[Z6]: https://zitadel.com/zitadel-cloud
[Z7]: https://help.zitadel.com/zitadel-enterprise-cloud-vs-enterprise-self-hosted
[Z8]: https://zitadel.com/pricing/detail
[K1]: https://www.keycloak.org/securing-apps/oidc-layers
[K2]: https://www.keycloak.org/securing-apps/overview
[K3]: https://www.keycloak.org/docs/latest/server_admin/index.html
[K4]: https://www.keycloak.org/server/configuration-production
[K5]: https://github.com/keycloak/keycloak/blob/main/LICENSE.txt
