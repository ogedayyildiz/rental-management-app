import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tenantPermissions } from '../packages/permissions/dist/index.js';
import { FinanceOperationsService } from '../apps/api/dist/finance/finance.service.js';
import { PrismaFinanceOperationsUnitOfWork } from '../apps/api/dist/infrastructure/prisma.finance-operations.js';
import { CustomerService } from '../apps/api/dist/customers/customer.service.js';
import { PrismaCustomerUnitOfWork } from '../apps/api/dist/infrastructure/prisma.customers.js';
import { MachineService } from '../apps/api/dist/machines/machine.service.js';
import { PrismaMachineUnitOfWork } from '../apps/api/dist/infrastructure/prisma.machines.js';
import { RentalService } from '../apps/api/dist/rentals/rental.service.js';
import { PrismaRentalUnitOfWork } from '../apps/api/dist/infrastructure/prisma.rentals.js';
export async function financeOperationsCases(suite, db, fixture) {
  const unit = new PrismaFinanceOperationsUnitOfWork(db),
    service = new FinanceOperationsService(unit),
    machines = new MachineService(new PrismaMachineUnitOfWork(db));
  async function tenant() {
    const t = await fixture();
    await db.rolePermission.createMany({
      data: tenantPermissions.map((permissionKey) => ({
        organizationId: t.organization.id,
        roleId: t.role.id,
        permissionKey,
      })),
      skipDuplicates: true,
    });
    t.customer = await new CustomerService(
      new PrismaCustomerUnitOfWork(db),
    ).create(
      t.principal,
      t.organization.id,
      { type: 'COMPANY', displayName: 'Collections customer' },
      randomUUID(),
    );
    t.machine = await machines.create(
      t.principal,
      t.organization.id,
      {
        fleetNumber: randomUUID(),
        manufacturer: 'Finance',
        model: 'Test',
        category: 'Lift',
        branchId: t.branch.id,
      },
      randomUUID(),
    );
    return t;
  }
  const body = (t, extra = {}) => ({
    kind: 'RECEIVABLE',
    title: 'Approved receivable',
    customerId: t.customer.id,
    machineId: null,
    rentalId: null,
    branchId: t.branch.id,
    acquisitionMethod: null,
    counterpartyName: null,
    occurredOn: '2026-01-01',
    amount: '100',
    currency: 'TRY',
    tax: { mode: 'EXCLUSIVE', rate: '20' },
    documentStatus: 'NONE',
    documentReference: null,
    notes: null,
    installments: [],
    ...extra,
  });
  const create = (t, extra = {}) =>
    service.create(
      t.principal,
      t.organization.id,
      body(t, extra),
      randomUUID(),
    );
  const confirm = (t, row) =>
    service.confirm(
      t.principal,
      t.organization.id,
      row.id,
      { version: row.updatedAt },
      randomUUID(),
    );
  const payment = (row, extra = {}) => ({
    installmentId: row.installments[0].id,
    idempotencyKey: randomUUID(),
    amount: '40',
    currency: 'TRY',
    paidOn: '2026-01-02',
    method: 'BANK_TRANSFER',
    reference: null,
    ...extra,
  });
  const pay = (t, row, input = payment(row)) =>
    service.pay(t.principal, t.organization.id, row.id, input, randomUUID());
  await suite.test(
    'finance: rental-linked receivables preserve customer ownership and require rental pricing access',
    async () => {
      const t = await tenant(),
        customers = new CustomerService(new PrismaCustomerUnitOfWork(db)),
        rentals = new RentalService(new PrismaRentalUnitOfWork(db)),
        second = await customers.create(
          t.principal,
          t.organization.id,
          { type: 'COMPANY', displayName: 'Different debtor' },
          randomUUID(),
        ),
        rental = await rentals.create(
          t.principal,
          t.organization.id,
          {
            customerId: t.customer.id,
            branchId: t.branch.id,
            items: [{ machineIds: [t.machine.id], quantity: 1 }],
          },
          randomUUID(),
        ),
        row = await confirm(t, await create(t, { rentalId: rental.id }));
      await assert.rejects(
        create(t, { customerId: second.id, rentalId: rental.id }),
        { code: 'NOT_FOUND' },
      );
      await assert.rejects(
        rentals.update(
          t.principal,
          t.organization.id,
          rental.id,
          { customerId: second.id },
          randomUUID(),
        ),
        { code: 'RENTAL_FINANCIAL_REFERENCE' },
      );
      await assert.rejects(
        db.rental.update({
          where: { id: rental.id },
          data: { customerId: second.id },
        }),
      );
      assert.equal(
        (await service.get(t.principal, t.organization.id, row.id)).customerId,
        t.customer.id,
      );
      await db.rolePermission.deleteMany({
        where: { roleId: t.role.id, permissionKey: 'rentals.pricing.view' },
      });
      await assert.rejects(
        service.get(t.principal, t.organization.id, row.id),
        { code: 'NOT_FOUND' },
      );
      assert.deepEqual(
        await service.balances(t.principal, t.organization.id, {
          kind: 'RECEIVABLE',
        }),
        [],
      );
    },
  );
  await suite.test(
    'finance: legacy VAT stays unspecified and new priced records require a tax decision',
    async () => {
      const t = await tenant();
      await db.machine.update({
        where: { id: t.machine.id },
        data: { acquisitionCost: '100', currency: 'TRY' },
      });
      let row = await machines.get(
        t.principal,
        t.organization.id,
        t.machine.id,
      );
      assert.deepEqual(row.tax, { mode: 'UNSPECIFIED' });
      row = await machines.update(
        t.principal,
        t.organization.id,
        row.id,
        { notes: 'Unrelated edit' },
        randomUUID(),
      );
      assert.equal(row.acquisitionCost, '100');
      assert.deepEqual(row.tax, { mode: 'UNSPECIFIED' });
      await assert.rejects(
        machines.create(
          t.principal,
          t.organization.id,
          {
            fleetNumber: randomUUID(),
            manufacturer: 'F',
            model: 'M',
            category: 'C',
            acquisitionCost: '100',
            currency: 'TRY',
          },
          randomUUID(),
        ),
        { code: 'INVALID_INPUT' },
      );
      await assert.rejects(create(t, { tax: { mode: 'UNSPECIFIED' } }), {
        code: 'INVALID_INPUT',
      });
      await assert.rejects(
        create(t, { amount: '9999999999999999999999999999.99' }),
        {
          code: 'INVALID_INPUT',
        },
      );
      await assert.rejects(
        create(t, { tax: { mode: 'NOT_APPLICABLE', reason: '' } }),
        { code: 'INVALID_INPUT' },
      );
      const exempt = await create(t, {
        tax: {
          mode: 'NOT_APPLICABLE',
          reason: 'Manually recorded applicability',
        },
        documentStatus: 'RECORDED',
        documentReference: 'Invoice ref',
      });
      assert.equal(exempt.taxAmount, '0.00');
    },
  );
  await suite.test(
    'finance: approved receivable, partial collection, document update and account balance',
    async () => {
      const t = await tenant();
      let row = await create(t);
      assert.equal(row.status, 'DRAFT');
      assert.equal(row.grossAmount, '120.00');
      assert.deepEqual(
        await service.balances(t.principal, t.organization.id, {
          kind: 'RECEIVABLE',
        }),
        [],
      );
      await assert.rejects(pay(t, row), { code: 'INVALID_TRANSITION' });
      row = await confirm(t, row);
      row = await pay(t, row);
      assert.equal(row.remainingAmount, '80.00');
      assert.equal(row.settlementStatus, 'PARTIAL');
      row = await service.document(
        t.principal,
        t.organization.id,
        row.id,
        { documentStatus: 'RECORDED', documentReference: 'Later invoice' },
        randomUUID(),
      );
      assert.equal(row.taxAmount, '20.00');
      assert.deepEqual(
        await service.balances(t.principal, t.organization.id, {
          kind: 'RECEIVABLE',
          customerId: t.customer.id,
        }),
        [
          {
            currency: 'TRY',
            grossAmount: '120.00',
            paidAmount: '40.00',
            remainingAmount: '80.00',
          },
        ],
      );
      await assert.rejects(
        service.update(
          t.principal,
          t.organization.id,
          row.id,
          { version: row.updatedAt, record: body(t, { amount: '1' }) },
          randomUUID(),
        ),
        { code: 'INVALID_TRANSITION' },
      );
      row = await pay(t, row, payment(row, { amount: '80' }));
      assert.equal(row.settlementStatus, 'PAID');
      assert.equal(row.remainingAmount, '0.00');
      assert.equal(
        await db.rental.count({ where: { organizationId: t.organization.id } }),
        0,
      );
    },
  );
  await suite.test(
    'finance: payment idempotency, altered replays, overpayments, future dates and currencies',
    async () => {
      const t = await tenant(),
        row = await confirm(t, await create(t)),
        input = payment(row);
      await pay(t, row, input);
      await pay(t, row, input);
      assert.equal(
        await db.financePayment.count({ where: { recordId: row.id } }),
        1,
      );
      await assert.rejects(pay(t, row, { ...input, amount: '41' }), {
        code: 'CONFLICT',
      });
      for (const change of [
        { amount: '81' },
        { currency: 'USD' },
        { amount: '0' },
        { amount: '-1' },
        { amount: '1.001' },
        { paidOn: '2099-01-01' },
        { installmentId: randomUUID() },
      ])
        await assert.rejects(pay(t, row, payment(row, change)), {
          code: 'INVALID_INPUT',
        });
    },
  );
  await suite.test(
    'finance: reversal preserves history, cancellation requires release and removes outstanding debt',
    async () => {
      const t = await tenant();
      let row = await pay(t, await confirm(t, await create(t)));
      await assert.rejects(
        service.cancel(
          t.principal,
          t.organization.id,
          row.id,
          { version: row.updatedAt, reason: 'Correction' },
          randomUUID(),
        ),
        { code: 'INVALID_TRANSITION' },
      );
      row = await service.reverse(
        t.principal,
        t.organization.id,
        row.id,
        row.payments[0].id,
        { reason: 'Incorrect transfer' },
        randomUUID(),
      );
      assert.equal(row.remainingAmount, '120.00');
      assert.ok(row.payments[0].reversedAt);
      row = await service.cancel(
        t.principal,
        t.organization.id,
        row.id,
        { version: row.updatedAt, reason: 'Duplicate agreement' },
        randomUUID(),
      );
      assert.equal(row.status, 'CANCELLED');
      assert.deepEqual(
        await service.balances(t.principal, t.organization.id, {
          kind: 'RECEIVABLE',
        }),
        [],
      );
      await assert.rejects(confirm(t, row), { code: 'INVALID_TRANSITION' });
      const actions = (
        await db.auditEvent.findMany({
          where: {
            organizationId: t.organization.id,
            action: { startsWith: 'FINANCE_' },
          },
        })
      ).map((x) => x.action);
      for (const action of [
        'FINANCE_RECORD_CREATED',
        'FINANCE_RECORD_CONFIRMED',
        'FINANCE_PAYMENT_RECORDED',
        'FINANCE_PAYMENT_REVERSED',
        'FINANCE_RECORD_CANCELLED',
      ])
        assert.ok(actions.includes(action));
    },
  );
  await suite.test(
    'finance: leasing deposit and installments, mismatch rejection and historical acquisition value separation',
    async () => {
      const t = await tenant(),
        input = body(t, {
          kind: 'PAYABLE',
          customerId: null,
          machineId: t.machine.id,
          acquisitionMethod: 'LEASING',
          counterpartyName: 'Leasing company',
          installments: [
            { kind: 'DEPOSIT', dueOn: '2026-01-01', amount: '20' },
            { kind: 'INSTALLMENT', dueOn: '2026-02-01', amount: '100' },
          ],
        });
      let row = await service.create(
        t.principal,
        t.organization.id,
        input,
        randomUUID(),
      );
      row = await confirm(t, row);
      assert.ok(row.installments.every((i) => i.overdue));
      row = await pay(t, row, payment(row, { amount: '20' }));
      assert.equal(row.remainingAmount, '100.00');
      assert.equal(row.installments[0].remainingAmount, '0.00');
      assert.equal(
        (await db.machine.findUniqueOrThrow({ where: { id: t.machine.id } }))
          .acquisitionCost,
        null,
      );
      const invalid = await create(t, {
        installments: [{ kind: 'DUE', dueOn: '2026-01-01', amount: '119' }],
      });
      await assert.rejects(confirm(t, invalid), { code: 'INVALID_INPUT' });
    },
  );
  await suite.test(
    'finance: serializable concurrent collections cannot exceed an installment',
    async () => {
      const t = await tenant(),
        row = await confirm(t, await create(t));
      const results = await Promise.allSettled([
        pay(t, row, payment(row, { amount: '80' })),
        pay(t, row, payment(row, { amount: '80' })),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        (await service.get(t.principal, t.organization.id, row.id))
          .remainingAmount,
        '40.00',
      );
    },
  );
  await suite.test(
    'finance: tenant/branch restrictions and financial permission denial apply to rows and totals',
    async () => {
      const t = await tenant(),
        other = await tenant(),
        row = await confirm(t, await create(t));
      await assert.rejects(
        service.get(other.principal, other.organization.id, row.id),
        { code: 'NOT_FOUND' },
      );
      await assert.rejects(create(t, { customerId: other.customer.id }), {
        code: 'NOT_FOUND',
      });
      await assert.rejects(
        create(t, {
          kind: 'PAYABLE',
          customerId: null,
          machineId: other.machine.id,
          acquisitionMethod: 'CASH',
          counterpartyName: 'Test',
        }),
        { code: 'NOT_FOUND' },
      );
      await assert.rejects(create(t, { branchId: other.branch.id }), {
        code: 'NOT_FOUND',
      });
      await db.membership.update({
        where: { id: t.membership.id },
        data: { branchScope: 'SELECTED_BRANCHES' },
      });
      assert.deepEqual(
        (
          await service.list(t.principal, t.organization.id, {
            kind: 'RECEIVABLE',
            branchId: t.branch.id,
          })
        ).items,
        [],
      );
      assert.deepEqual(
        await service.balances(t.principal, t.organization.id, {
          kind: 'RECEIVABLE',
        }),
        [],
      );
      await assert.rejects(
        service.get(t.principal, t.organization.id, row.id),
        { code: 'NOT_FOUND' },
      );
      await db.membership.update({
        where: { id: t.membership.id },
        data: { branchScope: 'ALL_BRANCHES' },
      });
      await db.rolePermission.deleteMany({
        where: { roleId: t.role.id, permissionKey: 'finance.receivables.view' },
      });
      await assert.rejects(
        service.get(t.principal, t.organization.id, row.id),
        { code: 'ACCESS_DENIED' },
      );
      await assert.rejects(
        service.list(t.principal, t.organization.id, { kind: 'RECEIVABLE' }),
        { code: 'ACCESS_DENIED' },
      );
    },
  );
  await suite.test(
    'finance: audit failure rolls back obligations and payment insertions',
    async () => {
      const t = await tenant(),
        failing = new FinanceOperationsService({
          run: (work) =>
            unit.run((r) =>
              work({
                ...r,
                audit: {
                  append: async () => {
                    throw Error('audit unavailable');
                  },
                },
              }),
            ),
        });
      await assert.rejects(
        failing.create(t.principal, t.organization.id, body(t), randomUUID()),
        /audit unavailable/,
      );
      assert.equal(
        await db.financeRecord.count({
          where: { organizationId: t.organization.id },
        }),
        0,
      );
      const row = await confirm(t, await create(t));
      await assert.rejects(
        failing.pay(
          t.principal,
          t.organization.id,
          row.id,
          payment(row),
          randomUUID(),
        ),
        /audit unavailable/,
      );
      assert.equal(
        await db.financePayment.count({ where: { recordId: row.id } }),
        0,
      );
      assert.equal(
        (await service.get(t.principal, t.organization.id, row.id))
          .remainingAmount,
        '120.00',
      );
    },
  );
  await suite.test(
    'finance: cursor pagination and per-currency totals include all approved pages only',
    async () => {
      const t = await tenant();
      for (const currency of ['TRY', 'USD', 'EUR'])
        await confirm(t, await create(t, { currency }));
      await create(t, { title: 'Draft excluded' });
      const a = await service.list(t.principal, t.organization.id, {
        kind: 'RECEIVABLE',
        limit: 2,
      });
      assert.equal(a.items.length, 2);
      assert.ok(a.nextCursor);
      const b = await service.list(t.principal, t.organization.id, {
        kind: 'RECEIVABLE',
        limit: 2,
        cursor: a.nextCursor,
      });
      assert.equal(b.items.length, 2);
      assert.equal(new Set([...a.items, ...b.items].map((r) => r.id)).size, 4);
      const balances = await service.balances(t.principal, t.organization.id, {
        kind: 'RECEIVABLE',
        limit: 1,
      });
      assert.equal(balances.length, 3);
      assert.ok(balances.every((b) => b.remainingAmount === '120.00'));
    },
  );
  await suite.test(
    'finance: database composite keys reject foreign ownership and cross-currency payments',
    async () => {
      const t = await tenant(),
        other = await tenant(),
        row = await confirm(t, await create(t));
      await assert.rejects(
        db.financeRecord.update({
          where: { id: row.id },
          data: { customerId: other.customer.id },
        }),
      );
      await assert.rejects(
        db.financePayment.create({
          data: {
            ...payment(row, { currency: 'USD' }),
            recordId: row.id,
            organizationId: t.organization.id,
            paidOn: new Date('2026-01-02'),
            createdById: t.user.id,
          },
        }),
      );
      await assert.rejects(
        db.financeInstallment.create({
          data: {
            organizationId: other.organization.id,
            recordId: row.id,
            kind: 'DUE',
            dueOn: new Date('2026-01-02'),
            amount: '10',
          },
        }),
      );
    },
  );
}
