import { externalIdentitySchema, identifierSchema } from '@rental/validation';
import { hasPermission } from '@rental/permissions';
import type { PlatformPermission, TenantPermission } from '@rental/permissions';
import { AccessError } from './contracts.js';
import type { IdentityVerifier } from './contracts.js';
import type { AccessRepository, TenantAccessRecord } from './contracts.js';

const principals = new WeakSet<object>();
const contexts = new WeakSet<object>();
export interface AuthenticatedPrincipal {
  readonly userId: string;
}
export function assertAuthenticatedPrincipal(
  principal: AuthenticatedPrincipal,
): void {
  if (!principals.has(principal)) throw new AccessError('UNAUTHENTICATED');
}
export interface TenantContext extends TenantAccessRecord {
  readonly kind: 'tenant';
}

export class AuthenticationService {
  constructor(
    private readonly verifier: IdentityVerifier,
    private readonly repository: AccessRepository,
  ) {}

  async authenticate(authorization: unknown): Promise<AuthenticatedPrincipal> {
    if (
      typeof authorization !== 'string' ||
      authorization.length > 16384 ||
      !/^Bearer \S+$/.test(authorization)
    ) {
      throw new AccessError('UNAUTHENTICATED');
    }
    const identity = externalIdentitySchema.safeParse(
      await this.verifier.verify(authorization.slice(7)),
    );
    if (!identity.success) throw new AccessError('UNAUTHENTICATED');
    const user = await this.repository.findActiveUser(identity.data);
    if (!user) throw new AccessError('UNAUTHENTICATED');
    const principal = Object.freeze({ userId: user.id });
    principals.add(principal);
    return principal;
  }
}

export class AccessService {
  constructor(private readonly repository: AccessRepository) {}

  async tenant(
    principal: AuthenticatedPrincipal,
    requestedOrganization: unknown,
  ): Promise<TenantContext> {
    if (!principals.has(principal)) throw new AccessError('UNAUTHENTICATED');
    const organization = identifierSchema.safeParse(requestedOrganization);
    if (!organization.success) throw new AccessError('INVALID_INPUT');
    const record = await this.repository.findTenantAccess(
      principal.userId,
      organization.data,
    );
    if (!record) throw new AccessError('ACCESS_DENIED');
    const context: TenantContext = Object.freeze({
      ...record,
      kind: 'tenant',
      permissions: Object.freeze([...record.permissions]),
      branchIds: Object.freeze([...record.branchIds]),
    });
    contexts.add(context);
    return context;
  }

  async requirePlatform(
    principal: AuthenticatedPrincipal,
    permission: PlatformPermission,
  ): Promise<void> {
    if (!principals.has(principal)) throw new AccessError('UNAUTHENTICATED');
    const granted = await this.repository.findPlatformPermissions(
      principal.userId,
    );
    if (
      !permission.startsWith('platform.') ||
      !granted ||
      !hasPermission(granted, permission)
    ) {
      throw new AccessError('ACCESS_DENIED');
    }
  }
}

export function requirePermission(
  context: TenantContext,
  permission: TenantPermission,
): void {
  assertTenantContext(context);
  if (
    permission.startsWith('platform.') ||
    !hasPermission(context.permissions, permission)
  ) {
    throw new AccessError('ACCESS_DENIED');
  }
}

export function assertTenantContext(context: TenantContext): void {
  if (!contexts.has(context)) throw new AccessError('ACCESS_DENIED');
}
