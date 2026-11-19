import { randomUUID } from 'node:crypto';
import { MachineService } from '../apps/api/dist/machines/machine.service.js';
import { PrismaMachineUnitOfWork } from '../apps/api/dist/infrastructure/prisma.machines.js';
import { CustomerService } from '../apps/api/dist/customers/customer.service.js';
import { PrismaCustomerUnitOfWork } from '../apps/api/dist/infrastructure/prisma.customers.js';
import { RentalService } from '../apps/api/dist/rentals/rental.service.js';
import { PrismaRentalUnitOfWork } from '../apps/api/dist/infrastructure/prisma.rentals.js';
import { MaintenanceService } from '../apps/api/dist/maintenance/maintenance.service.js';
import { PrismaMaintenanceUnitOfWork } from '../apps/api/dist/infrastructure/prisma.maintenance.js';
import { ingest, fixtureAdapter } from '../apps/telemetry/dist/ingestion.js';
export async function operationsFixtures(
  db,
  p,
  org,
  north,
  south,
  now = new Date(),
) {
  const machines = new MachineService(new PrismaMachineUnitOfWork(db)),
    customers = new CustomerService(new PrismaCustomerUnitOfWork(db)),
    rentals = new RentalService(new PrismaRentalUnitOfWork(db), () => now),
    maintenance = new MaintenanceService(
      new PrismaMaintenanceUnitOfWork(db),
      () => now,
    );
  const customer = await customers.create(
    p,
    org,
    { type: 'COMPANY', displayName: 'Operations customer' },
    randomUUID(),
  );
  const createMachine = (fleetNumber, branchId) =>
    machines.create(
      p,
      org,
      {
        fleetNumber,
        branchId,
        manufacturer: 'Operations',
        model: 'Lift',
        category: 'Scissor',
      },
      randomUUID(),
    );
  const rows = [];
  for (const [suffix, branchId] of [
    ['NORTH', north],
    ['SOUTH', south],
  ]) {
    const machine = await createMachine('OPS-' + suffix, branchId);
    let rental = await rentals.create(
      p,
      org,
      {
        customerId: customer.id,
        branchId,
        items: [
          {
            quantity: 1,
            machineIds: [machine.id],
            plannedStartAt: new Date(+now - 2 * 86400000).toISOString(),
            plannedEndAt: new Date(+now - 3600000).toISOString(),
            agreedRate: '123456.78',
            currency: 'TRY',
            rateUnit: 'DAILY',
          },
        ],
      },
      randomUUID(),
    );
    rental = await rentals.confirm(p, org, rental.id, false, randomUUID());
    rental = await rentals.dispatch(
      p,
      org,
      rental.id,
      {
        assignmentIds: rental.items[0].assignments.map((a) => a.id),
        actualStartAt: new Date(+now - 86400000).toISOString(),
      },
      randomUUID(),
    );
    const serviceMachine = await createMachine(
      'OPS-SERVICE-' + suffix,
      branchId,
    );
    let order = await maintenance.create(
      p,
      org,
      {
        machineId: serviceMachine.id,
        branchId,
        type: 'PREVENTIVE',
        title: 'Operations overdue ' + suffix,
        dueAt: new Date(+now - 3600000).toISOString(),
        impact: 'WARNING',
      },
      randomUUID(),
    );
    order = await maintenance.transition(
      p,
      org,
      order.id,
      'open',
      {},
      randomUUID(),
    );
    rows.push({ machine, serviceMachine, rental, order });
  }
  const device = await db.trackingDevice.create({
    data: {
      organizationId: org,
      provider: 'simulator',
      providerDeviceId: 'operations-source',
    },
  });
  await db.deviceInstallation.create({
    data: {
      organizationId: org,
      trackingDeviceId: device.id,
      machineId: rows[0].machine.id,
      installedAt: new Date(+now - 2 * 86400000),
    },
  });
  await ingest(
    db,
    {
      organizationId: org,
      provider: 'simulator',
      externalId: device.providerDeviceId,
    },
    fixtureAdapter('simulator'),
    {
      eventId: 'operations-stale',
      recordedAt: new Date(+now - 86400000).toISOString(),
      signals: {
        batterySoc: 10,
        operatingHours: 200,
        location: { latitude: 41, longitude: 29 },
      },
      fault: { code: 'OPS_FAULT', active: true, severity: 'WARNING' },
    },
    now,
  );
  return { customer, north: rows[0], south: rows[1], device };
}
