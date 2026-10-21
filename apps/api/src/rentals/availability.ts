import type { RentalView, RentalItemView } from '@rental/validation';
import type { RentalMachine } from './contracts.js';
import { AccessError } from '../access/contracts.js';
export function serviceAllowsDispatch(machine: RentalMachine): boolean {
  return (
    machine.lifecycleState === 'ACTIVE' &&
    ['NORMAL', 'MAINTENANCE_DUE'].includes(machine.serviceState)
  );
}
export function matches(
  machine: RentalMachine,
  item: Pick<
    RentalItemView,
    'requestedCategoryId' | 'requestedModelId' | 'specifications'
  >,
): boolean {
  if (
    item.requestedCategoryId &&
    item.requestedCategoryId !== machine.categoryId
  )
    return false;
  if (item.requestedModelId && item.requestedModelId !== machine.modelId)
    return false;
  return Object.entries(item.specifications).every(([key, value]) =>
    typeof value === 'number'
      ? typeof machine.specifications[key] === 'number' &&
        machine.specifications[key] >= value
      : machine.specifications[key] === value,
  );
}
interface Demand {
  start: number;
  end: number;
  candidates: string[];
  quantity: number;
}
export function assertSchedule(
  rentals: RentalView[],
  machines: RentalMachine[],
  from: string,
  to: string,
  now: number,
): void {
  const lower = Date.parse(from),
    upper = Date.parse(to),
    demands: Demand[] = [];
  for (const rental of rentals) {
    if (!['RESERVED', 'ACTIVE'].includes(rental.status)) continue;
    for (const item of rental.items) {
      if (item.removedAt || !item.plannedStartAt || !item.plannedEndAt)
        continue;
      const assignments = item.assignments.filter((a) => !a.releasedAt),
        start = Date.parse(item.plannedStartAt),
        end = Date.parse(item.plannedEndAt);
      for (const a of assignments) {
        if (a.actualEndAt) continue;
        demands.push({
          start: a.actualStartAt
            ? Math.min(start, Date.parse(a.actualStartAt))
            : start,
          end: a.actualStartAt && end <= now ? Infinity : end,
          candidates: [a.machineId],
          quantity: 1,
        });
      }
      const unassigned = item.quantity - assignments.length;
      if (unassigned > 0)
        demands.push({
          start,
          end,
          candidates: machines
            .filter(
              (m) =>
                serviceAllowsDispatch(m) &&
                m.branchId === rental.branchId &&
                matches(m, item),
            )
            .map((m) => m.id),
          quantity: unassigned,
        });
    }
  }
  const relevant = demands.filter((d) => d.start < upper && d.end > lower),
    points = new Set<number>([lower]);
  for (const d of relevant)
    if (d.start >= lower && d.start < upper) points.add(d.start);
  for (const time of points) {
    const slots: string[][] = [];
    for (const d of relevant) {
      if (d.start <= time && time < d.end) {
        if (d.quantity > machines.length)
          throw new AccessError('RENTAL_CONFLICT');
        for (let n = 0; n < d.quantity; n++) slots.push(d.candidates);
      }
    }
    // Bipartite matching accounts for overlapping model and category demand without assigning physical units early.
    const owners = new Map<string, number>();
    function assign(slot: number, seen: Set<string>): boolean {
      for (const machine of slots[slot] ?? []) {
        if (seen.has(machine)) continue;
        seen.add(machine);
        const owner = owners.get(machine);
        if (owner === undefined || assign(owner, seen)) {
          owners.set(machine, slot);
          return true;
        }
      }
      return false;
    }
    for (let slot = 0; slot < slots.length; slot++)
      if (!assign(slot, new Set())) throw new AccessError('RENTAL_CONFLICT');
  }
}
