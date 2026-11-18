import { randomUUID } from 'node:crypto';
import { CustomerService } from '../apps/api/dist/customers/customer.service.js';
import { MachineService } from '../apps/api/dist/machines/machine.service.js';
import { RentalService } from '../apps/api/dist/rentals/rental.service.js';
import { MaintenanceService } from '../apps/api/dist/maintenance/maintenance.service.js';
import { PrismaCustomerUnitOfWork } from '../apps/api/dist/infrastructure/prisma.customers.js';
import { PrismaMachineUnitOfWork } from '../apps/api/dist/infrastructure/prisma.machines.js';
import { PrismaRentalUnitOfWork } from '../apps/api/dist/infrastructure/prisma.rentals.js';
import { PrismaMaintenanceUnitOfWork } from '../apps/api/dist/infrastructure/prisma.maintenance.js';
// Test-side data builder. Uses authoritative services, never analytics table writes.
export async function financeFixtures(db, p, org, branchId) {
  const machines = new MachineService(new PrismaMachineUnitOfWork(db)),
    rentals = new RentalService(
      new PrismaRentalUnitOfWork(db),
      () => new Date('2026-01-20T00:00:00Z'),
    ),
    maintenance = new MaintenanceService(
      new PrismaMaintenanceUnitOfWork(db),
      () => new Date('2026-01-05T00:00:00Z'),
    );
  const customer = await new CustomerService(
    new PrismaCustomerUnitOfWork(db),
  ).create(
    p,
    org,
    { type: 'COMPANY', displayName: 'Finance Example Customer' },
    randomUUID(),
  );
  const rows = [];
  for (const [suffix, cost, currency] of [
    ['KNOWN', '1000', 'TRY'],
    ['ZERO', '0', 'TRY'],
    ['UNKNOWN', null, null],
    ['MIXED', '500', 'EUR'],
  ])
    rows.push(
      await machines.create(
        p,
        org,
        {
          fleetNumber: 'FIN-' + suffix,
          manufacturer: 'Finance',
          model: 'Analytics Lift',
          category: 'Finance Access',
          branchId,
          acquisitionDate: '2025-01-01',
          ...(cost === null ? {} : { acquisitionCost: cost, currency }),
        },
        randomUUID(),
      ),
    );
  const completed = [];
  for (let n = 0; n < rows.length; n++) {
    let r = await rentals.create(
      p,
      org,
      {
        customerId: customer.id,
        branchId,
        items: [
          {
            quantity: 1,
            machineIds: [rows[n].id],
            plannedStartAt: '2026-01-01T00:00:00Z',
            plannedEndAt: '2026-01-03T00:00:00Z',
            agreedRate: n === 0 ? '600' : '100',
            rateUnit: n === 1 ? 'FIXED_PERIOD' : 'DAILY',
            currency: 'TRY',
          },
        ],
      },
      randomUUID(),
    );
    r = await rentals.confirm(p, org, r.id, false, randomUUID());
    const ids = r.items[0].assignments.map((a) => a.id);
    await rentals.dispatch(
      p,
      org,
      r.id,
      { assignmentIds: ids, actualStartAt: '2026-01-01T00:00:00Z' },
      randomUUID(),
    );
    await rentals.returnMachines(
      p,
      org,
      r.id,
      { assignmentIds: ids, actualEndAt: '2026-01-02T00:00:00Z' },
      randomUUID(),
    );
    completed.push(await rentals.complete(p, org, r.id, randomUUID()));
  }
  const orders = [];
  for (const [machine, amount, currency] of [
    [rows[0], '100', 'TRY'],
    [rows[3], '25', 'EUR'],
  ]) {
    let w = await maintenance.create(
      p,
      org,
      {
        machineId: machine.id,
        branchId,
        type: 'INSPECTION',
        title: 'Finance example inspection',
      },
      randomUUID(),
    );
    await maintenance.mutateChild(
      p,
      org,
      w.id,
      'cost',
      { kind: 'LABOR', amount, currency },
      randomUUID(),
    );
    for (const action of ['open', 'start', 'complete'])
      w = await maintenance.transition(
        p,
        org,
        w.id,
        action,
        { notes: 'Fixture completed' },
        randomUUID(),
      );
    orders.push(w);
  }
  return { customer, machines: rows, rentals: completed, workOrders: orders };
}
