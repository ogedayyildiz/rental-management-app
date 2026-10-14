import { createHash, randomBytes } from 'node:crypto';
import {
  identifierSchema,
  invitationAcceptanceSchema,
  invitationCreateSchema,
  invitationEmailSchema,
  organizationCreateSchema,
} from '@rental/validation';
import { AccessService, requirePermission } from '../access/access.service.js';
import type { AuthenticatedPrincipal } from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type { InvitationIdentityVerifier } from '../access/contracts.js';
import type { OnboardingUnitOfWork } from './contracts.js';
import type { InvitationInput, OnboardingRepository } from './contracts.js';

export function invitationHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class OnboardingService {
  constructor(
    private readonly unitOfWork: OnboardingUnitOfWork,
    private readonly verifier: InvitationIdentityVerifier,
  ) {}

  private async issue(
    repository: OnboardingRepository,
    organizationId: string,
    actorId: string,
    input: InvitationInput,
    requestId: string,
  ) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const id = await repository.createInvitation(
      organizationId,
      actorId,
      input,
      invitationHash(token),
      expiresAt,
    );
    await repository.audit(
      organizationId,
      actorId,
      'INVITATION_CREATED',
      'OrganizationInvitation',
      id,
      requestId,
    );
    // Returned once to the authorized inviter for secure delivery. Never persisted or logged.
    return { invitationId: id, token, expiresAt };
  }

  async createOrganization(
    principal: AuthenticatedPrincipal,
    input: unknown,
    requestId: string,
  ) {
    const parsed = organizationCreateSchema.safeParse(input);
    if (!parsed.success) throw new AccessError('INVALID_INPUT');
    return this.unitOfWork.run(async (repository, access) => {
      await new AccessService(access).requirePlatform(
        principal,
        'platform.organization.create',
      );
      const { email, ...organization } = parsed.data;
      const organizationId = await repository.createOrganization(organization);
      await repository.audit(
        organizationId,
        principal.userId,
        'ORGANIZATION_CREATED',
        'Organization',
        organizationId,
        requestId,
      );
      const roleId =
        await repository.createAdministratorTemplate(organizationId);
      const invitation = await this.issue(
        repository,
        organizationId,
        principal.userId,
        {
          email,
          roleIds: [roleId],
          branchScope: 'ALL_BRANCHES',
          branchIds: [],
        },
        requestId,
      );
      return { organizationId, ...invitation };
    });
  }

  async invite(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    input: unknown,
    requestId: string,
  ) {
    const parsed = invitationCreateSchema.safeParse(input);
    if (!parsed.success) throw new AccessError('INVALID_INPUT');
    return this.unitOfWork.run(async (repository, access) => {
      const context = await new AccessService(access).tenant(
        principal,
        organizationId,
      );
      requirePermission(context, 'users.manage');
      requirePermission(context, 'roles.manage');
      const grants = await repository.eligibleGrants(
        context.organizationId,
        parsed.data,
      );
      if (
        !grants ||
        grants.some((key) => !context.permissions.includes(key)) ||
        (context.branchScope === 'SELECTED_BRANCHES' &&
          (parsed.data.branchScope === 'ALL_BRANCHES' ||
            parsed.data.branchIds.some(
              (id) => !context.branchIds.includes(id),
            )))
      )
        throw new AccessError('ACCESS_DENIED');
      return this.issue(
        repository,
        context.organizationId,
        principal.userId,
        parsed.data,
        requestId,
      );
    });
  }

  async revoke(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    invitationId: unknown,
    requestId: string,
  ) {
    const id = identifierSchema.safeParse(invitationId);
    if (!id.success) throw new AccessError('INVALID_INPUT');
    return this.unitOfWork.run(async (repository, access) => {
      const context = await new AccessService(access).tenant(
        principal,
        organizationId,
      );
      requirePermission(context, 'users.manage');
      if (!(await repository.revokeInvitation(context.organizationId, id.data)))
        throw new AccessError('NOT_FOUND');
      await repository.audit(
        context.organizationId,
        principal.userId,
        'INVITATION_REVOKED',
        'OrganizationInvitation',
        id.data,
        requestId,
      );
      return { revoked: true };
    });
  }

  async revokeInitial(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    invitationId: unknown,
    requestId: string,
  ) {
    const organization = identifierSchema.safeParse(organizationId);
    const invitation = identifierSchema.safeParse(invitationId);
    if (!organization.success || !invitation.success)
      throw new AccessError('INVALID_INPUT');
    return this.unitOfWork.run(async (repository, access) => {
      await new AccessService(access).requirePlatform(
        principal,
        'platform.organization.create',
      );
      // Platform provisioning authority ends when the organization has membership history.
      if (await repository.hasMemberships(organization.data))
        throw new AccessError('ACCESS_DENIED');
      if (
        !(await repository.revokeInvitation(organization.data, invitation.data))
      )
        throw new AccessError('NOT_FOUND');
      await repository.audit(
        organization.data,
        principal.userId,
        'INVITATION_REVOKED',
        'OrganizationInvitation',
        invitation.data,
        requestId,
      );
      return { revoked: true };
    });
  }

  async accept(authorization: unknown, input: unknown, requestId: string) {
    const parsed = invitationAcceptanceSchema.safeParse(input);
    if (!parsed.success) throw new AccessError('INVALID_INPUT');
    if (
      typeof authorization !== 'string' ||
      authorization.length > 16384 ||
      !/^Bearer \S+$/.test(authorization)
    )
      throw new AccessError('UNAUTHENTICATED');
    const identity = await this.verifier.verifyInvitationIdentity(
      authorization.slice(7),
    );
    const email = invitationEmailSchema.safeParse(identity?.email);
    if (!identity || !email.success) throw new AccessError('UNAUTHENTICATED');
    return this.unitOfWork.run(async (repository) => {
      const invitation = await repository.findInvitation(
        invitationHash(parsed.data.token),
      );
      if (
        !invitation ||
        invitation.status !== 'PENDING' ||
        invitation.expiresAt <= new Date() ||
        invitation.email.toLowerCase() !== email.data ||
        !(await repository.eligibleGrants(
          invitation.organizationId,
          invitation,
        ))
      )
        throw new AccessError('ACCESS_DENIED');
      const existing = await repository.resolveUser(
        identity.issuer,
        identity.subject,
      );
      if (existing && existing.status !== 'ACTIVE')
        throw new AccessError('ACCESS_DENIED');
      if (!existing && (await repository.emailExists(email.data)))
        throw new AccessError('ACCESS_DENIED');
      const userId =
        existing?.id ??
        (await repository.createUser(
          identity.name,
          email.data,
          identity.issuer,
          identity.subject,
        ));
      if (!existing)
        await repository.audit(
          invitation.organizationId,
          userId,
          'IDENTITY_LINKED',
          'User',
          userId,
          requestId,
        );
      const membershipId = await repository.createMembership(
        userId,
        invitation,
      );
      if (!(await repository.consumeInvitation(invitation, userId)))
        throw new AccessError('ACCESS_DENIED');
      await repository.audit(
        invitation.organizationId,
        userId,
        'MEMBERSHIP_CREATED',
        'Membership',
        membershipId,
        requestId,
      );
      for (const roleId of invitation.roleIds)
        await repository.audit(
          invitation.organizationId,
          userId,
          'ROLE_ASSIGNED',
          'Role',
          roleId,
          requestId,
        );
      await repository.audit(
        invitation.organizationId,
        userId,
        'INVITATION_ACCEPTED',
        'OrganizationInvitation',
        invitation.id,
        requestId,
      );
      return {
        userId,
        organizationId: invitation.organizationId,
        membershipId,
      };
    });
  }
}
