import { auditMetadataSchema, identifierSchema } from '@rental/validation';
import { assertTenantContext } from '../access/access.service.js';
import type { TenantContext } from '../access/access.service.js';

export interface AuditRecord {
  organizationId: string;
  actorUserId: string;
  actorType: 'USER';
  action: 'BRANCH_UPDATED';
  targetType: 'Branch';
  targetId: string;
  result: 'SUCCESS';
  source: 'api';
  requestId: string;
  metadata: { before: { name: string }; after: { name: string } };
}
export interface AuditRepository {
  append(event: AuditRecord): Promise<void>;
}

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async branchUpdated(
    context: TenantContext,
    requestId: string,
    branchId: string,
    before: string,
    after: string,
  ): Promise<void> {
    assertTenantContext(context);
    identifierSchema.parse(requestId);
    identifierSchema.parse(branchId);
    const metadata = { before: { name: before }, after: { name: after } };
    auditMetadataSchema.parse(metadata);
    await this.repository.append({
      organizationId: context.organizationId,
      actorUserId: context.userId,
      actorType: 'USER',
      action: 'BRANCH_UPDATED',
      targetType: 'Branch',
      targetId: branchId,
      result: 'SUCCESS',
      source: 'api',
      requestId,
      metadata,
    });
  }
}
