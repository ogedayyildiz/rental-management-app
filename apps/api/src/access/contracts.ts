export interface ExternalIdentityReference {
  readonly issuer: string;
  readonly subject: string;
}

// Implementations must verify signature, trusted issuer, audience, expiry and revocation
// as appropriate before returning an identity. Never decode an unverified JWT here.
export abstract class IdentityVerifier {
  abstract verify(
    credential: string,
  ): Promise<ExternalIdentityReference | null>;
}

export interface VerifiedInvitationIdentity extends ExternalIdentityReference {
  readonly email: string;
  readonly name: string;
}

// Onboarding additionally requires provider-verified ownership of the invited email.
export abstract class InvitationIdentityVerifier {
  abstract verifyInvitationIdentity(
    credential: string,
  ): Promise<VerifiedInvitationIdentity | null>;
}

export interface TenantAccessRecord {
  readonly membershipId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly permissions: readonly string[];
  readonly branchIds: readonly string[];
  readonly branchScope: 'ALL_BRANCHES' | 'SELECTED_BRANCHES';
}

export interface AccessRepository {
  findActiveUser(
    identity: ExternalIdentityReference,
  ): Promise<{ id: string } | null>;
  findTenantAccess(
    userId: string,
    organizationId: string,
  ): Promise<TenantAccessRecord | null>;
  findPlatformPermissions(userId: string): Promise<readonly string[] | null>;
}

export class AccessError extends Error {
  constructor(
    readonly code:
      'UNAUTHENTICATED' | 'ACCESS_DENIED' | 'NOT_FOUND' | 'INVALID_INPUT',
  ) {
    super(code);
  }
}
