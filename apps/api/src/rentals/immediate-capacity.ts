import type { RentalView } from '@rental/validation';
import type { RentalMachine } from './contracts.js';
import { assertSchedule, serviceAllowsDispatch } from './availability.js';
import { AccessError } from '../access/contracts.js';

/** Additional simultaneous units at this instant, including unallocated demand.
 * Uses the same capacity matcher as reservation, never a second availability rule. */
export function immediateCapacity(
  machines: RentalMachine[],
  commitments: RentalView[],
  visibleIds: Set<string>,
  now: Date,
): number {
  const held: RentalView[] = [];
  for (const m of machines) {
    if (!visibleIds.has(m.id) || !serviceAllowsDispatch(m)) continue;
    const at = now.toISOString(),
      end = new Date(now.getTime() + 1).toISOString();
    const demand: RentalView = {
      transportation: null,
      transportationHistory: [],
      id: `capacity-${m.id}`,
      organizationId: '',
      number: '',
      customerId: '',
      customerName: '',
      branchId: m.branchId,
      branchName: null,
      timezone: 'UTC',
      status: 'RESERVED',
      notes: null,
      plannedStartAt: at,
      plannedEndAt: end,
      actualStartAt: null,
      actualEndAt: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: at,
      updatedAt: at,
      items: [
        {
          id: 'capacity',
          requestedCategoryId: null,
          requestedModelId: null,
          quantity: 1,
          specifications: {},
          plannedStartAt: at,
          plannedEndAt: end,
          removedAt: null,
          assignments: [
            {
              id: 'capacity',
              machineId: m.id,
              fleetNumber: m.fleetNumber,
              manufacturer: m.manufacturer,
              model: m.model,
              assignedAt: at,
              releasedAt: null,
              actualStartAt: null,
              actualEndAt: null,
              reason: null,
            },
          ],
        },
      ],
    };
    try {
      assertSchedule(
        [...commitments, ...held, demand],
        machines,
        at,
        end,
        now.getTime(),
      );
      held.push(demand);
    } catch (error) {
      if (!(error instanceof AccessError) || error.code !== 'RENTAL_CONFLICT')
        throw error;
    }
  }
  return held.length;
}
