import type { Prisma } from '@rental/database';
import type { MachineView } from '@rental/validation';
import type { TenantContext } from '../access/access.service.js';
import { assertTenantContext } from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import { assertSchedule, matches } from '../rentals/availability.js';
import { PrismaRentalRepository } from './prisma.rentals.js';

// Same transaction and scheduling lock as Rental; no tenant-wide data leaves this adapter.
export class PrismaMachineCommitments {
  private readonly rentals: PrismaRentalRepository;
  constructor(db: Prisma.TransactionClient) {
    this.rentals = new PrismaRentalRepository(db);
  }
  async lock(c: TenantContext) {
    assertTenantContext(c);
    await this.rentals.lock(c.organizationId);
  }
  async validate(c: TenantContext, before: MachineView, after: MachineView) {
    if (
      before.modelId === after.modelId &&
      before.branchId === after.branchId &&
      before.lifecycleState === after.lifecycleState &&
      Object.keys({ ...before.specifications, ...after.specifications }).every(
        (key) =>
          before.specifications[key as keyof typeof before.specifications] ===
          after.specifications[key as keyof typeof after.specifications],
      )
    )
      return;
    const commitments = await this.rentals.commitments(c);
    const machines = await this.rentals.machines(c);
    for (const rental of commitments) {
      for (const item of rental.items) {
        if (item.removedAt) continue;
        if (
          item.assignments.some(
            (a) => a.machineId === after.id && !a.releasedAt && !a.actualEndAt,
          ) &&
          (after.lifecycleState !== 'ACTIVE' ||
            after.branchId !== rental.branchId ||
            !matches(after, item))
        )
          throw new AccessError('MACHINE_COMMITMENT_CONFLICT');
      }
    }
    const dates = commitments
      .flatMap((r) =>
        r.items
          .filter((i) => !i.removedAt)
          .flatMap((i) =>
            i.plannedStartAt && i.plannedEndAt
              ? [i.plannedStartAt, i.plannedEndAt]
              : [],
          ),
      )
      .sort();
    if (dates.length > 0) {
      try {
        assertSchedule(
          commitments,
          machines,
          dates[0]!,
          dates[dates.length - 1]!,
          Date.now(),
        );
      } catch (error) {
        if (error instanceof AccessError && error.code === 'RENTAL_CONFLICT')
          throw new AccessError('MACHINE_COMMITMENT_CONFLICT');
        throw error;
      }
    }
  }
}
