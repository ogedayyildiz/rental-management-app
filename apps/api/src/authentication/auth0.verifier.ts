import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { IdentityVerifier } from '../access/contracts.js';
import type {
  ExternalIdentityReference,
  VerifiedInvitationIdentity,
  InvitationIdentityVerifier,
} from '../access/contracts.js';

export interface Auth0Configuration {
  issuer: string;
  audience: string;
  clientIds: string[];
}

export class Auth0IdentityVerifier
  extends IdentityVerifier
  implements InvitationIdentityVerifier
{
  private readonly keys: JWTVerifyGetKey;
  constructor(
    private readonly configuration: Auth0Configuration,
    keys?: JWTVerifyGetKey,
  ) {
    super();
    this.keys =
      keys ??
      createRemoteJWKSet(
        new URL('.well-known/jwks.json', configuration.issuer),
        { timeoutDuration: 5000 },
      );
  }

  override async verify(
    credential: string,
  ): Promise<ExternalIdentityReference | null> {
    try {
      const { payload } = await jwtVerify(credential, this.keys, {
        issuer: this.configuration.issuer,
        audience: this.configuration.audience,
        algorithms: ['RS256'],
        requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'azp'],
        clockTolerance: 5,
      });
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        payload.sub.length > 255 ||
        typeof payload.azp !== 'string' ||
        !this.configuration.clientIds.includes(payload.azp) ||
        payload.gty === 'client-credentials' ||
        payload.sub.endsWith('@clients') ||
        typeof payload.iat !== 'number' ||
        payload.iat > Date.now() / 1000 + 5
      )
        return null;
      return { issuer: this.configuration.issuer, subject: payload.sub };
    } catch {
      return null;
    }
  }

  async verifyInvitationIdentity(
    credential: string,
  ): Promise<VerifiedInvitationIdentity | null> {
    const identity = await this.verify(credential);
    if (!identity) return null;
    try {
      // Access tokens need not carry email. Obtain it from the fixed trusted issuer,
      // and bind the authenticated userinfo response to the verified subject.
      const response = await fetch(
        new URL('userinfo', this.configuration.issuer),
        {
          headers: { authorization: `Bearer ${credential}` },
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) return null;
      const profile: unknown = await response.json();
      if (
        typeof profile !== 'object' ||
        profile === null ||
        !('sub' in profile) ||
        profile.sub !== identity.subject ||
        !('email_verified' in profile) ||
        profile.email_verified !== true ||
        !('email' in profile) ||
        typeof profile.email !== 'string' ||
        profile.email.length > 320
      )
        return null;
      const name =
        'name' in profile && typeof profile.name === 'string'
          ? profile.name
          : profile.email;
      return { ...identity, email: profile.email, name: name.slice(0, 200) };
    } catch {
      return null;
    }
  }
}
