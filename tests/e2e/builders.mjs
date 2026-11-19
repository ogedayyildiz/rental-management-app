import { operationsFixtures } from '../operations-fixtures.mjs';
import { randomUUID } from 'node:crypto';
import {
  tenantPermissions,
  platformPermissions,
} from '../../packages/permissions/dist/index.js';
import { issuer, identityFor } from './isolation.mjs';
import { AuthenticationService } from '../../apps/api/dist/access/access.service.js';
import { PrismaAccessRepository } from '../../apps/api/dist/infrastructure/prisma.repositories.js';
import { CustomerService } from '../../apps/api/dist/customers/customer.service.js';
import { PrismaCustomerUnitOfWork } from '../../apps/api/dist/infrastructure/prisma.customers.js';
import { MachineService } from '../../apps/api/dist/machines/machine.service.js';
import { PrismaMachineUnitOfWork } from '../../apps/api/dist/infrastructure/prisma.machines.js';
import { RentalService } from '../../apps/api/dist/rentals/rental.service.js';
import { PrismaRentalUnitOfWork } from '../../apps/api/dist/infrastructure/prisma.rentals.js';
import { MaintenanceService } from '../../apps/api/dist/maintenance/maintenance.service.js';
import { PrismaMaintenanceUnitOfWork } from '../../apps/api/dist/infrastructure/prisma.maintenance.js';
export const organization = (db, name) =>
  db.organization.create({
    data: {
      name,
      defaultCurrency: 'TRY',
      defaultLanguage: 'en',
      timezone: 'Europe/Istanbul',
    },
  });
export const branch = (db, organizationId, name) =>
  db.branch.create({ data: { organizationId, name } });
export async function member(db, name, org, keys, allowedBranch) {
  const user = await db.user.create({
    data: { name, email: `${name.toLowerCase()}@example.test` },
  });
  await db.externalIdentity.create({
    data: { userId: user.id, issuer, subject: name },
  });
  if (org) {
    const role = await db.role.create({
      data: {
        organizationId: org.id,
        name,
        templateKey:
          keys === tenantPermissions ? 'TENANT_ADMINISTRATION' : null,
        permissions: {
          create: keys.map((permissionKey) => ({ permissionKey })),
        },
      },
    });
    const membership = await db.membership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        status: 'ACTIVE',
        branchScope: allowedBranch ? 'SELECTED_BRANCHES' : 'ALL_BRANCHES',
        joinedAt: new Date(),
      },
    });
    await db.membershipRole.create({
      data: {
        organizationId: org.id,
        membershipId: membership.id,
        roleId: role.id,
      },
    });
    if (allowedBranch)
      await db.membershipBranch.create({
        data: {
          organizationId: org.id,
          membershipId: membership.id,
          branchId: allowedBranch.id,
        },
      });
  }
  return user;
}
export function builders(db, principal, org) {
  const customers = new CustomerService(new PrismaCustomerUnitOfWork(db));
  const machines = new MachineService(new PrismaMachineUnitOfWork(db));
  const rentals = new RentalService(new PrismaRentalUnitOfWork(db));
  const maintenance = new MaintenanceService(
    new PrismaMaintenanceUnitOfWork(db),
  );
  return {
    customer: (extra = {}) =>
      customers.create(
        principal,
        org.id,
        { type: 'COMPANY', displayName: 'E2E Active Customer', ...extra },
        randomUUID(),
      ),
    machine: (extra = {}) =>
      machines.create(
        principal,
        org.id,
        {
          fleetNumber: randomUUID(),
          manufacturer: 'E2E',
          model: 'Lift 8',
          category: 'Scissor lift',
          ...extra,
        },
        randomUUID(),
      ),
    rental: (input) => rentals.create(principal, org.id, input, randomUUID()),
    workOrder: (input) =>
      maintenance.create(principal, org.id, input, randomUUID()),
    plan: (input) =>
      maintenance.savePlan(principal, org.id, null, input, randomUUID()),
  };
}
export async function seed(db, env) {
  for (const [scope, keys] of [
    ['TENANT', tenantPermissions],
    ['PLATFORM', platformPermissions],
  ])
    for (const key of keys)
      await db.permission.upsert({
        where: { key },
        create: { key, scope },
        update: {},
      });
  const org = await organization(db, 'E2E Rental Company'),
    second = await organization(db, 'Other E2E Company');
  const north = await branch(db, org.id, 'North'),
    south = await branch(db, org.id, 'South');
  const platform = await member(db, 'PLATFORM_OPERATOR');
  const platformRole = await db.platformRole.create({
    data: {
      name: 'E2E platform',
      permissions: {
        create: { permissionKey: 'platform.organization.create' },
      },
    },
  });
  await db.platformAccess.create({
    data: {
      userId: platform.id,
      active: true,
      roles: { create: { roleId: platformRole.id } },
    },
  });
  await member(db, 'TENANT_ADMIN_ALL_BRANCHES', org, tenantPermissions);
  await member(
    db,
    'TENANT_LIMITED',
    org,
    [
      'customers.read',
      'machines.read',
      'rentals.read',
      'maintenance.read',
      'device.read',
      'telemetry.read',
      'finance.analytics.view',
    ],
    north,
  );
  await member(db, 'TENANT_NO_FINANCE', org, [
    ...tenantPermissions.filter(
      (k) =>
        !k.startsWith('finance.') &&
        !k.includes('.pricing.') &&
        !k.includes('.costs.') &&
        ![
          'organization.manage',
          'users.manage',
          'roles.manage',
          'branches.manage',
          'audit.read',
        ].includes(k),
    ),
    'finance.analytics.view',
    'finance.analytics.export',
  ]);
  await member(db, 'SECOND_TENANT_ADMIN', second, tenantPermissions);
  await member(db, 'MANAGED_MEMBER', org, [
    'customers.read',
    'machines.read',
    'rentals.read',
    'maintenance.read',
  ]);
  const multi = await member(db, 'TENANT_MULTI_ORG', org, [
    'customers.read',
    'machines.read',
  ]);
  const otherRole = await db.role.create({
    data: {
      organizationId: second.id,
      name: 'Multi organization observer',
      permissions: {
        create: [
          { permissionKey: 'customers.read' },
          { permissionKey: 'machines.read' },
        ],
      },
    },
  });
  await db.membership.create({
    data: {
      organizationId: second.id,
      userId: multi.id,
      status: 'ACTIVE',
      branchScope: 'ALL_BRANCHES',
      roles: { create: { roleId: otherRole.id } },
    },
  });
  const auth = new AuthenticationService(
    { verify: async (token) => identityFor(env, token) },
    new PrismaAccessRepository(db),
  );
  const p = await auth.authenticate(
    `Bearer ${JSON.parse(env.RENTAL_E2E_IDENTITIES).TENANT_ADMIN_ALL_BRANCHES.token}`,
  );
  const b = builders(db, p, org);
  const finance = await financeFixtures(db, p, org.id, north.id);
  const customer = await b.customer(),
    customer2 = await b.customer({ displayName: 'E2E Second Active Customer' });
  const inactive = await b.customer({ displayName: 'E2E Archived Customer' });
  await new CustomerService(new PrismaCustomerUnitOfWork(db)).archive(
    p,
    org.id,
    inactive.id,
    randomUUID(),
  );
  const machine = await b.machine({
    fleetNumber: 'E2E-NORTH',
    branchId: north.id,
    acquisitionCost: '87654.123',
    currency: 'TRY',
  });
  const otherBranch = await b.machine({
    fleetNumber: 'E2E-SOUTH',
    branchId: south.id,
  });
  const workMachine = await b.machine({
    fleetNumber: 'E2E-SERVICE',
    branchId: north.id,
  });
  const financialRental = await b.rental({
    customerId: customer.id,
    branchId: south.id,
    notes: 'E2E financial visibility fixture',
    items: [
      {
        machineIds: [otherBranch.id],
        quantity: 1,
        plannedStartAt: '2035-01-01T10:00:00.000Z',
        plannedEndAt: '2035-01-02T10:00:00.000Z',
        agreedRate: '9876.54321',
        rateUnit: 'DAILY',
        currency: 'TRY',
      },
    ],
  });
  const hiddenDevice = await db.trackingDevice.create({
    data: {
      organizationId: org.id,
      provider: 'simulator',
      providerDeviceId: 'South branch unit',
    },
  });
  await db.deviceInstallation.create({
    data: {
      organizationId: org.id,
      trackingDeviceId: hiddenDevice.id,
      machineId: otherBranch.id,
      installedAt: new Date(),
    },
  });
  const foreignDevice = await db.trackingDevice.create({
    data: {
      organizationId: second.id,
      provider: 'simulator',
      providerDeviceId: 'Foreign inventory',
    },
  });
  const financialWorkOrder = await b.workOrder({
    machineId: otherBranch.id,
    branchId: south.id,
    type: 'INSPECTION',
    title: 'E2E financial service fixture',
  });
  await new MaintenanceService(new PrismaMaintenanceUnitOfWork(db)).mutateChild(
    p,
    org.id,
    financialWorkOrder.id,
    'cost',
    { kind: 'LABOR', amount: '98765.4321', currency: 'TRY' },
    randomUUID(),
  );
  const operations = await operationsFixtures(
    db,
    p,
    org.id,
    north.id,
    south.id,
  );
  return {
    operations,
    finance,
    org,
    second,
    north,
    south,
    customer,
    customer2,
    machine,
    otherBranch,
    workMachine,
    financialRental,
    financialWorkOrder,
    hiddenDevice,
    foreignDevice,
  };
}
import { financeFixtures } from '../finance-fixtures.mjs';
