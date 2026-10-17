# Authentication and organization onboarding

This phase implements accepted ADR-011. Business authorization remains in PostgreSQL. No Customer, Machine, Rental, Maintenance, Finance or Telemetry workflows are implemented.

## Implemented architecture

```text
Auth0 RS256 API access token
  -> Auth0IdentityVerifier
  -> verified issuer + subject
  -> ExternalIdentity -> active User
  -> active Membership / separate PlatformAccess
  -> permission and branch-scoped application operation
```

The adapter uses JOSE verification with keys from the configured issuer's JWKS endpoint. It verifies signature, RS256 algorithm, exact issuer, API audience, expiry, issued-at, subject and an allowed web/native client (`azp`). Client-credentials principals are rejected. Key URLs never come from an untrusted token. Unknown identities cannot use ordinary authenticated endpoints. ID tokens are not backend API credentials.

For invitation acceptance only, the adapter also calls the fixed issuer's `/userinfo` endpoint using the verified access token. Its subject must match the token and `email_verified` must be true. The backend never accepts email/profile claims supplied by the frontend. Network/provider failure denies acceptance.

Provider organizations and role claims grant nothing. `/me` returns the application user and current database-derived organization/branch/permission contexts, plus separately named platform permissions. Each protected operation rechecks authorization; the response is not a reusable authority credential.

## Configuration to provide

No real tenant values, client IDs, audiences or secrets are included. Blank entries in root `.env.example` are intentional. The existing local `.env` is not overwritten.

| Location | Variables | Source |
| --- | --- | --- |
| Root `.env` for API | `AUTH0_ISSUER` | Exact trusted HTTPS issuer, including trailing `/` |
| Root `.env` for API | `AUTH0_AUDIENCE` | Identifier of the Auth0 custom API |
| Root `.env` for API | `AUTH0_ALLOWED_CLIENT_IDS` | Comma-separated Regular Web and Native application client IDs |
| `apps/web/.env.local` | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | Web application settings; domain is hostname only |
| `apps/web/.env.local` | `AUTH0_AUDIENCE` | Same custom API identifier |
| `apps/web/.env.local` | `AUTH0_SECRET` | Locally generated random 32-byte hex cookie encryption secret |
| `apps/web/.env.local` | `APP_BASE_URL`, `API_BASE_URL` | Fixed web origin and reachable backend origin |
| `apps/mobile/.env` | `EXPO_PUBLIC_AUTH0_DOMAIN`, `EXPO_PUBLIC_AUTH0_CLIENT_ID`, `EXPO_PUBLIC_AUTH0_AUDIENCE` | Domain, Native client ID, same API audience; public values |
| `apps/mobile/.env` | `EXPO_PUBLIC_AUTH0_SCHEME` | Chosen native callback scheme |
| `apps/mobile/.env` | `EXPO_PUBLIC_API_BASE_URL` | Backend URL reachable from simulator/device; HTTPS in deployed environments |
| `apps/mobile/.env` | `MOBILE_IOS_BUNDLE_IDENTIFIER`, `MOBILE_ANDROID_PACKAGE` | Your registered native application identifiers |

The API fails startup if required Auth0 configuration is absent/invalid. Next.js validates its server settings when starting development or production serving. Offline builds/type generation do not require tenant credentials. Expo can export unconfigured bundles showing a configuration-required screen; that is not native authentication verification. Supplying native domain/scheme/identifiers requires the complete group.

Do not put `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, database credentials or any management token into `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*`. Provide runtime environment variables through the deployment secret manager. No Auth0 Management API client secret is required by this implementation.

## Auth0 dashboard steps

1. Create/select the approved EU-region managed tenant after confirming commercial terms, data processing and residency. Use distinct provider configuration for development, staging and production. Enable MFA for tenant-console operators.
2. Create a **custom API**, choose its identifier yourself, and select **RS256** signing. Copy that identifier into all audience settings. Do not use a client ID as the API audience. Enable **Allow Offline Access** for the requested refresh-token flow. Use a short access-token lifetime (recommended initial value: 600 seconds, subject to review).
3. Create a **Regular Web Application**. Record its domain, client ID and client secret. Use hosted Universal Login and authorization code flow. Enable the required database/social connection only as intended; do not enable automatic email-only account linking.
4. With the repository's local web origin, set Allowed Callback URLs to `http://127.0.0.1:3000/auth/callback`, Allowed Logout URLs to `http://127.0.0.1:3000`, and Allowed Web Origins to `http://127.0.0.1:3000`. Use exact HTTPS equivalents for deployed origins. Do not mix `localhost` and `127.0.0.1` unintentionally or use wildcard callbacks.
5. Create a separate **Native Application**, with no embedded client secret. Enable authorization code/refresh-token grants and refresh-token rotation with bounded expiration. Provide its client ID to mobile and to the API allowlist.
6. Register both native callback URLs below as Allowed Callback URLs **and Allowed Logout URLs**. Replace every placeholder with your selected value; these are templates, not working tenant configuration:

   ```text
   <scheme>://<auth0-domain>/ios/<ios-bundle-identifier>/callback
   <scheme>://<auth0-domain>/android/<android-package>/callback
   ```

   The installed SDK generates these paths with the configured custom scheme. Register the exact lowercase Android package and the actual iOS bundle identifier. Review platform-associated HTTPS links before production where required; custom-scheme interception is mitigated by PKCE, not by a secret in the app.
7. Configure email delivery/verification and recovery. Invitation acceptance requires a provider-verified email matching the invited address. Configure appropriate MFA/recovery policies before real platform administration; action-specific step-up is not implemented here.
8. Configure access-token issuance to include Auth0's `azp` client identifier. The backend allowlist must contain only the intended Web and Native client IDs. No application role, membership or organization claim customization is needed.
9. Review token/session lifetimes, logs and abuse protection. Disable request/response-body and authorization-header logging in proxies/APM, especially for invitation endpoints. Provider login logs do not replace application auditing.

Generate the web cookie secret directly into the ignored server environment file using the non-printing command in the [local verification guide](14-AUTH0-LOCAL-VERIFICATION.md). Do not send secrets in chat or commit them.

## Web flow

Next.js uses `@auth0/nextjs-auth0` and the Next.js 16 `proxy.ts` integration. `/auth/login`, `/auth/callback` and `/auth/logout` are handled by the SDK. The SDK stores its encrypted HTTP-only application session and handles the authorization-code flow. Application sessions expire after eight hours, with one-hour inactivity timeout.

The localized page offers login/logout, an application access check and explicit invitation-token submission. `/api/backend/me` obtains an API token server-side and calls `/me`. The browser never needs the raw API token: the SDK access-token endpoint is disabled. The same backend bridge supports the onboarding routes listed below, with a fixed destination, route allowlist, no redirects, no-store responses and same-origin checks for mutations. It is not an open proxy. The API remains authoritative.

Paste an invitation token only after login. Tokens are not included in login return URLs, browser query strings or analytics. They are cleared from component state after successful acceptance. The current minimal interface does not include a complete platform organization-management form; the authenticated onboarding APIs are available through the fixed backend bridge.

## Mobile flow

`react-native-auth0` provides the system-browser authorization-code/PKCE flow, credential manager and session clearing. `app.config.ts` installs its Expo plugin when real native configuration is supplied. The SDK credential manager uses native protected storage; tokens are obtained only when calling the API and are never stored in React state, AsyncStorage or logs. Logout attempts provider-session clearing and always clears local credentials.

Use an Expo development build or production binary; **Expo Go is unsupported**. After configuration, create native builds with `pnpm --filter @rental/mobile exec expo run:android` and, on macOS with Xcode, `expo run:ios`, or use your approved EAS build setup. The current Windows JavaScript export does not prove iOS/Android compilation, secure-storage behavior or browser callbacks.

Check login, cancellation, refresh after restart, logout, verified-email recovery and invitation acceptance on both platforms. A physical device cannot reach the workstation API through its own `127.0.0.1`; supply a deliberately configured reachable development endpoint. Production mobile requests must use HTTPS.

## API endpoints

| Method/path | Policy |
| --- | --- |
| `GET /me` | Existing active authenticated application user |
| `POST /platform/organizations` | `platform.organization.create`, rechecked in transaction |
| `POST /platform/organizations/:organizationId/invitations/:invitationId/revoke` | Same platform provisioning permission, only before the organization has any membership history |
| `POST /organizations/:organizationId/invitations` | Active membership, `users.manage` and `roles.manage`; cannot grant permissions/branches beyond inviter's scope |
| `POST /organizations/:organizationId/invitations/:invitationId/revoke` | Active scoped membership and `users.manage` |
| `POST /invitations/accept` | Independently verified Auth0 identity plus verified invited email and secure token; does not require pre-existing User |

Organization creation accepts `{ name, defaultCurrency, defaultLanguage, timezone, email }`. It atomically creates the organization, a configurable `TENANT_ADMINISTRATION` template role containing only the four existing tenant administration permissions, and a pending initial invitation with all-branch scope. No role name is used for authorization.

Tenant invitation creation accepts `{ email, roleIds, branchScope, branchIds }`. `branchScope` is `ALL_BRANCHES` or `SELECTED_BRANCHES`; all-branch scope requires an empty branch list. Selected scope may be empty and grants no branch access. The server checks enabled same-organization roles and active same-organization branches. Acceptance accepts only `{ token }` plus a bearer access token. Request fields cannot select a user, issuer, subject, role or organization during acceptance.

Creation returns the token **once** to the authorized inviter with `invitationId` and `expiresAt`. Secure delivery is manual in this phase; no email vendor, notification domain or background sender is added. Do not log or paste the response into issue trackers. A lost token cannot be recovered from storage.

## Invitation lifecycle and identity linking

Tokens contain 32 cryptographically random bytes encoded as base64url; only SHA-256 hashes are stored. They expire after 48 hours. These are explicit initial security defaults, not provider requirements. A pending token can be revoked. Expired tokens are rejected by time comparison even if the stored status remains `PENDING`; no background expiry job is needed for security.

Acceptance revalidates expiry/status, verified email, active organization, enabled roles, active branches and tenant boundaries inside a serializable database transaction. It creates/reuses the user, creates the membership and intended assignments, conditionally marks the still-pending unexpired invitation accepted, and appends audits in the same commit. Concurrent/replayed acceptance cannot commit twice. Serialization/uniqueness conflicts fail closed; the client should reload/check access before retrying a failed response.

An existing exact issuer/subject mapping reuses its active User across organizations. An unknown identity creates a new User and ExternalIdentity only through a valid invitation. If its email matches an existing User, acceptance is denied rather than linking by email; authenticate using the previously linked identity. Additional-identity linking to an existing User requires a future proof-of-control workflow and is not implemented. Disabled users remain denied.

Acceptance never updates an existing membership, reactivates it, replaces its roles or broadens its branches. It rejects that situation for separately authorized membership management. No role-disable, permission-removal, membership-deactivation or tenant platform-grant endpoints are exposed. Thus this phase cannot remove the last tenant administrator; pending organizations can have zero members before initial acceptance. Future mutation APIs must add transactional last-administrator checks before exposing removals.

Audits cover organization creation, invitation creation/revocation/acceptance, membership creation, each role assignment and new identity linking. Actor, organization, action, target, timestamp and request correlation are preserved. Metadata is deliberately empty for these actions: no JWT, invitation token, authorization header, email profile dump or secret is recorded. A failed audit rolls back the operation.

## Initial platform operator and limits

There is no public signup-to-platform-admin route and no automatically privileged first user. A trusted local operator runs `pnpm --filter @rental/api bootstrap:platform --subject '<actual Auth0 User ID>' --confirm` after configuration and build. The command performs authorization code + PKCE through a temporary loopback callback, verifies the signed API token and verified-email userinfo through the existing adapter, and checks the exact expected subject. It transactionally creates/resolves the global identity and grants only `platform.organization.create`, with immutable bootstrap/identity audits. It rejects email-only linking, disabled users, any existing PlatformAccess (including inactive access), and a previous bootstrap audit. It never creates tenant membership and is not an HTTP application endpoint. See the [step-by-step Auth0 setup and real verification guide](14-AUTH0-LOCAL-VERIFICATION.md) for callbacks, environment mapping, bootstrap and manual checks. No actual account is created until the operator supplies real configuration and authenticates.

Logout does not instantly invalidate every offline-verified access token. Configure short token lifetimes and use application user/membership suspension for application access removal. Global session revocation, additional-identity linking, provider administration UI, automated email delivery and action-specific MFA step-up remain outside this phase. These limitations must be considered before production rollout.

## Verification

Run `pnpm install --frozen-lockfile`, `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, and `pnpm build`. No Prisma schema change or new migration is required by this phase.

Tests use locally generated RSA signing keys, a mocked provider userinfo response and a disposable local PostgreSQL database. They cover invalid tokens, unknown identities, email ownership, cross-tenant boundaries, invitation state/expiry/replay, concurrent acceptance, identity creation/reuse, email-only linking rejection, audit and transaction rollback. Existing tenant-isolation tests remain enabled. Synthetic test values are not usable Auth0 configuration.

Real Auth0 discovery, signing-key rotation, dashboard settings, hosted login/logout, email delivery, refresh/recovery, and native callback/secure-storage behavior require the real tenant and devices. Stop at that boundary; do not invent values to claim live verification.

Official integration references: [Next.js SDK](https://github.com/auth0/nextjs-auth0), [React Native SDK and Expo plugin](https://github.com/auth0/react-native-auth0), and [API access-token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens). Consult the installed SDK versions and current provider guidance when configuring the real tenant.

### Verification outcome (2026-10-14)

- All 38 automated tests passed, including the real PostgreSQL negative cases and concurrent/replayed acceptance.
- Workspace lint, typecheck and formatting checks passed.
- Full workspace build passed, including Next.js production build and Expo Android/iOS JavaScript exports.
- `expo install --check` reported dependencies up to date.
- Three existing database migrations are applied; no new migration or schema change was needed.
- PostgreSQL/TimescaleDB and Redis containers are healthy. TimescaleDB reports version 2.30.0; Redis returned PONG.
- No live Auth0 login or native binary/callback verification was performed. All actual provider configuration remains user-supplied.

### Changed areas

- `apps/api/src/authentication`: Auth0 adapter and verified-email boundary.
- `apps/api/src/access`: explicit authenticated/platform route policies and current application-user service/controller.
- `apps/api/src/onboarding`: invitation/organization use cases, contracts and HTTP endpoints.
- `apps/api/src/infrastructure`: scoped transactional onboarding and current-user repositories; foundation module wiring updated.
- `apps/web`: Auth0 server SDK, proxy, fixed backend bridge, localized account/invitation screen and startup validation.
- `apps/mobile`: Auth0 provider/credential use and configurable Expo native plugin.
- `packages/config`, `packages/validation`, `packages/i18n`: environment validation, onboarding schemas and English/Turkish strings.
- `tests`: local JWT/provider-boundary tests, PostgreSQL onboarding cases and updated HTTP/bootstrap regressions.
- Root environment example, workspace dependency manifests/lockfile, Turbo environment forwarding, README and foundation/ADR documentation.

Dependencies added: JOSE in the API, Auth0 Next.js SDK 4.31.1 in web, and React Native Auth0 5.11.1 in mobile. The transitive `browser-tabs-lock` postinstall is explicitly disabled; package installation succeeds without running that unnecessary script.
