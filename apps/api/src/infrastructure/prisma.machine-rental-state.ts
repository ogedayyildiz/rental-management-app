import type { Prisma } from '@rental/database';
import { assertTenantContext } from '../access/access.service.js';
import type { TenantContext } from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
// Only rental workflow composition receives this writer. Generic Machine DTOs never accept rentalState.
export class PrismaMachineRentalStateWriter {
  constructor(private readonly database: Prisma.TransactionClient) {}
  async set(
    context: TenantContext,
    id: string,
    state: 'NOT_RENTED' | 'RESERVED' | 'RENTED',
  ): Promise<void> {
    assertTenantContext(context);
    const result = await this.database.machine.updateMany({
      where: { organizationId: context.organizationId, id },
      data: { rentalState: state, updatedById: context.userId },
    });
    if (result.count !== 1) throw new AccessError('NOT_FOUND');
  }
}
