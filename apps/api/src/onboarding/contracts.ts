import type { AccessRepository } from '../access/contracts.js';

export interface InvitationInput {
  email: string;
  roleIds: string[];
  branchScope: 'ALL_BRANCHES' | 'SELECTED_BRANCHES';
  branchIds: string[];
}
export interface Invitation extends InvitationInput {
  id: string;
  organizationId: string;
  status: string;
  expiresAt: Date;
}
export interface OrganizationInput {
  name: string;
  defaultCurrency: string;
  defaultLanguage: string;
  timezone: string;
}
export interface OnboardingRepository {
  hasMemberships(organizationId: string): Promise<boolean>;
  createOrganization(input: OrganizationInput): Promise<string>;
  createAdministratorTemplate(organizationId: string): Promise<string>;
  eligibleGrants(
    organizationId: string,
    input: InvitationInput,
  ): Promise<string[] | null>;
  createInvitation(
    organizationId: string,
    actorId: string,
    input: InvitationInput,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<string>;
  findInvitation(tokenHash: string): Promise<Invitation | null>;
  revokeInvitation(
    organizationId: string,
    invitationId: string,
  ): Promise<boolean>;
  resolveUser(
    issuer: string,
    subject: string,
  ): Promise<{ id: string; status: string } | null>;
  emailExists(email: string): Promise<boolean>;
  createUser(
    name: string,
    email: string,
    issuer: string,
    subject: string,
  ): Promise<string>;
  createMembership(userId: string, invitation: Invitation): Promise<string>;
  consumeInvitation(invitation: Invitation, userId: string): Promise<boolean>;
  audit(
    organizationId: string,
    actorId: string,
    action: OnboardingAction,
    targetType: string,
    targetId: string,
    requestId: string,
  ): Promise<void>;
}
export type OnboardingAction =
  | 'ORGANIZATION_CREATED'
  | 'INVITATION_CREATED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_ACCEPTED'
  | 'MEMBERSHIP_CREATED'
  | 'ROLE_ASSIGNED'
  | 'IDENTITY_LINKED';
export abstract class OnboardingUnitOfWork {
  abstract run<T>(
    work: (
      repository: OnboardingRepository,
      access: AccessRepository,
    ) => Promise<T>,
  ): Promise<T>;
}
