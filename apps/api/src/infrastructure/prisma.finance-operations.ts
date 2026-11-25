import { Prisma, type PrismaClient } from '@rental/database';
import { Decimal } from 'decimal.js';
import {
  financeRecordViewSchema,
  settlementAmountSchema,
  type FinanceInput,
  type FinanceQuery,
  type FinancePaymentInput,
  type FinanceDocument,
} from '@rental/validation';
import {
  assertTenantContext,
  requirePermission,
  type TenantContext,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import {
  FinanceUnitOfWork,
  type FinanceRepositories,
  type FinanceRepository,
} from '../finance/contracts.js';
import { taxBreakdown, taxColumns, readTax } from '../finance/tax.js';
import {
  PrismaAccessRepository,
  PrismaAuditRepository,
} from './prisma.repositories.js';
import { rentalScope } from './prisma.rentals.js';
const D = Decimal.clone({ precision: 60 });
const include = {
  customer: { select: { displayName: true } },
  machine: { select: { fleetNumber: true } },
  rental: { select: { number: true } },
  branch: { select: { name: true } },
  organization: { select: { timezone: true } },
  installments: { orderBy: [{ dueOn: 'asc' }, { id: 'asc' }] },
  payments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.FinanceRecordInclude;
type Row = Prisma.FinanceRecordGetPayload<{ include: typeof include }>;
const date = (d: Date) => d.toISOString().slice(0, 10);
function today(timezone: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day']
    .map((k) => p.find((x) => x.type === k)!.value)
    .join('-');
}
function view(row: Row) {
  const paid = row.payments
    .filter((p) => !p.reversedAt)
    .reduce((v, p) => v.plus(p.amount.toFixed()), new D(0));
  const remaining = new D(row.grossAmount.toFixed()).minus(paid);
  return financeRecordViewSchema.parse({
    ...row,
    tax: readTax(row),
    customerName: row.customer?.displayName ?? null,
    fleetNumber: row.machine?.fleetNumber ?? null,
    rentalNumber: row.rental?.number ?? null,
    branchName: row.branch?.name ?? null,
    timezone: row.organization.timezone,
    occurredOn: date(row.occurredOn),
    amount: row.amount.toFixed(2),
    netAmount: row.netAmount.toFixed(2),
    taxAmount: row.taxAmount.toFixed(2),
    grossAmount: row.grossAmount.toFixed(2),
    paidAmount: paid.toFixed(2),
    remainingAmount: remaining.toFixed(2),
    settlementStatus: remaining.eq(0)
      ? 'PAID'
      : paid.gt(0)
        ? 'PARTIAL'
        : 'UNPAID',
    installments: row.installments.map((i) => {
      const ip = row.payments
          .filter((p) => p.installmentId === i.id && !p.reversedAt)
          .reduce((v, p) => v.plus(p.amount.toFixed()), new D(0)),
        ir = new D(i.amount.toFixed()).minus(ip);
      return {
        ...i,
        dueOn: date(i.dueOn),
        amount: i.amount.toFixed(2),
        paidAmount: ip.toFixed(2),
        remainingAmount: ir.toFixed(2),
        overdue:
          row.status === 'CONFIRMED' &&
          ir.gt(0) &&
          date(i.dueOn) < today(row.organization.timezone),
      };
    }),
    payments: row.payments.map((p) => ({
      ...p,
      amount: p.amount.toFixed(2),
      paidOn: date(p.paidOn),
      createdAt: p.createdAt.toISOString(),
      reversedAt: p.reversedAt?.toISOString() ?? null,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  });
}
export class PrismaFinanceOperationsRepository implements FinanceRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}
  async branches(c: TenantContext) {
    assertTenantContext(c);
    return this.db.branch.findMany({
      where: {
        organizationId: c.organizationId,
        active: true,
        ...(c.branchScope === 'ALL_BRANCHES'
          ? {}
          : { id: { in: [...c.branchIds] } }),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  async lock(c: TenantContext) {
    assertTenantContext(c);
    await this.db
      .$executeRaw`UPDATE "Organization" SET name=name WHERE id=${c.organizationId}::uuid`;
  }
  private scope(c: TenantContext): Prisma.FinanceRecordWhereInput {
    assertTenantContext(c);
    return {
      organizationId: c.organizationId,
      AND: [
        ...(c.branchScope === 'ALL_BRANCHES'
          ? []
          : [
              { branchId: { in: [...c.branchIds] } },
              {
                OR: [
                  { machineId: null },
                  { machine: { branchId: { in: [...c.branchIds] } } },
                ],
              },
            ]),
        {
          OR: [
            { rentalId: null },
            ...(c.permissions.includes('rentals.read') &&
            c.permissions.includes('rentals.pricing.view')
              ? [{ rental: rentalScope(c) }]
              : []),
          ],
        },
      ],
    };
  }
  private where(
    c: TenantContext,
    q: FinanceQuery,
  ): Prisma.FinanceRecordWhereInput {
    return {
      AND: [
        this.scope(c),
        {
          kind: q.kind,
          ...(q.status ? { status: q.status } : {}),
          ...(q.branchId ? { branchId: q.branchId } : {}),
          ...(q.customerId ? { customerId: q.customerId } : {}),
          ...(q.machineId ? { machineId: q.machineId } : {}),
        },
        ...(q.q
          ? [
              {
                OR: [
                  { title: { contains: q.q, mode: 'insensitive' as const } },
                  {
                    customer: {
                      displayName: {
                        contains: q.q,
                        mode: 'insensitive' as const,
                      },
                    },
                  },
                  {
                    machine: {
                      fleetNumber: {
                        contains: q.q,
                        mode: 'insensitive' as const,
                      },
                    },
                  },
                  {
                    documentReference: {
                      contains: q.q,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
  }
  async list(c: TenantContext, q: FinanceQuery) {
    const [time, id] = q.cursor?.split('|') ?? [];
    const rows = await this.db.financeRecord.findMany({
      where: {
        AND: [
          this.where(c, q),
          ...(time && id
            ? [
                {
                  OR: [
                    { createdAt: { lt: new Date(time) } },
                    { createdAt: new Date(time), id: { lt: id } },
                  ],
                },
              ]
            : []),
        ],
      },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const items = rows.slice(0, q.limit).map(view),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > q.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  async balances(c: TenantContext, q: FinanceQuery) {
    const where: Prisma.FinanceRecordWhereInput = {
      AND: [
        this.where(c, { ...q, status: 'CONFIRMED' }),
        { status: 'CONFIRMED' },
      ],
    };
    const totals = await this.db.financeRecord.groupBy({
      by: ['currency'],
      where,
      _sum: { grossAmount: true },
    });
    const payments = await this.db.financePayment.groupBy({
      by: ['currency'],
      where: {
        organizationId: c.organizationId,
        reversedAt: null,
        record: where,
      },
      _sum: { amount: true },
    });
    return totals.map((t) => {
      const gross = new D(t._sum.grossAmount?.toFixed() ?? '0'),
        paid = new D(
          payments
            .find((p) => p.currency === t.currency)
            ?._sum.amount?.toFixed() ?? '0',
        );
      return {
        currency: t.currency,
        grossAmount: gross.toFixed(2),
        paidAmount: paid.toFixed(2),
        remainingAmount: gross.minus(paid).toFixed(2),
      };
    });
  }
  async find(c: TenantContext, id: string) {
    const row = await this.db.financeRecord.findFirst({
      where: { AND: [this.scope(c), { id }] },
      include,
    });
    return row ? view(row) : null;
  }
  async requireSources(
    c: TenantContext,
    input: Parameters<FinanceRepository['requireSources']>[1],
  ) {
    assertTenantContext(c);
    if (
      c.branchScope !== 'ALL_BRANCHES' &&
      (!input.branchId || !c.branchIds.includes(input.branchId))
    )
      throw new AccessError('ACCESS_DENIED');
    if (
      input.branchId &&
      !(await this.db.branch.findFirst({
        where: {
          organizationId: c.organizationId,
          id: input.branchId,
          active: true,
        },
        select: { id: true },
      }))
    )
      throw new AccessError('NOT_FOUND');
    if (
      input.customerId &&
      !(await this.db.customer.findFirst({
        where: { organizationId: c.organizationId, id: input.customerId },
        select: { id: true },
      }))
    )
      throw new AccessError('NOT_FOUND');
    if (
      input.machineId &&
      !(await this.db.machine.findFirst({
        where: {
          organizationId: c.organizationId,
          id: input.machineId,
          ...(c.branchScope === 'ALL_BRANCHES'
            ? {}
            : { branchId: { in: [...c.branchIds] } }),
        },
        select: { id: true },
      }))
    )
      throw new AccessError('NOT_FOUND');
    if (input.rentalId) {
      if (!input.customerId) throw new AccessError('INVALID_INPUT');
      requirePermission(c, 'rentals.read');
      requirePermission(c, 'rentals.pricing.view');
      if (
        !(await this.db.rental.findFirst({
          where: {
            AND: [
              rentalScope(c),
              { id: input.rentalId, customerId: input.customerId },
            ],
          },
          select: { id: true },
        }))
      )
        throw new AccessError('NOT_FOUND');
    }
  }
  async save(c: TenantContext, id: string | null, input: FinanceInput) {
    assertTenantContext(c);
    const { tax, installments, ...fields } = input,
      amounts = taxBreakdown(input.amount, tax);
    if (
      !amounts ||
      !settlementAmountSchema.safeParse(amounts.grossAmount).success
    )
      throw new AccessError('INVALID_INPUT');
    const data = {
      ...fields,
      ...taxColumns(tax),
      ...amounts,
      occurredOn: new Date(input.occurredOn),
      updatedById: c.userId,
    };
    const row = id
      ? await this.db.financeRecord.update({
          where: {
            organizationId_id: { organizationId: c.organizationId, id },
          },
          data,
        })
      : await this.db.financeRecord.create({
          data: {
            ...data,
            organizationId: c.organizationId,
            createdById: c.userId,
          },
        });
    // Only drafts can enter this path; installments cannot already have payments.
    if (id)
      await this.db.financeInstallment.deleteMany({
        where: { organizationId: c.organizationId, recordId: id },
      });
    const schedule = installments.length
      ? installments
      : [
          {
            kind: 'DUE' as const,
            dueOn: input.occurredOn,
            amount: amounts.grossAmount,
          },
        ];
    await this.db.financeInstallment.createMany({
      data: schedule.map((i) => ({
        ...i,
        dueOn: new Date(i.dueOn),
        organizationId: c.organizationId,
        recordId: row.id,
      })),
    });
    return (await this.find(c, row.id))!;
  }
  async transition(
    c: TenantContext,
    id: string,
    status: 'CONFIRMED' | 'CANCELLED',
    reason?: string,
  ) {
    await this.db.financeRecord.update({
      where: { organizationId_id: { organizationId: c.organizationId, id } },
      data: {
        status,
        updatedById: c.userId,
        ...(status === 'CONFIRMED'
          ? { confirmedAt: new Date(), confirmedById: c.userId }
          : { cancelledAt: new Date(), cancellationReason: reason ?? null }),
      },
    });
    return (await this.find(c, id))!;
  }
  async document(c: TenantContext, id: string, input: FinanceDocument) {
    await this.db.financeRecord.update({
      where: { organizationId_id: { organizationId: c.organizationId, id } },
      data: { ...input, updatedById: c.userId },
    });
    return (await this.find(c, id))!;
  }
  async paymentByKey(c: TenantContext, key: string) {
    assertTenantContext(c);
    const p = await this.db.financePayment.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: c.organizationId,
          idempotencyKey: key,
        },
      },
    });
    return p
      ? {
          id: p.id,
          recordId: p.recordId,
          installmentId: p.installmentId,
          idempotencyKey: p.idempotencyKey,
          amount: p.amount.toFixed(2),
          currency: p.currency as FinancePaymentInput['currency'],
          paidOn: date(p.paidOn),
          method: p.method,
          reference: p.reference,
        }
      : null;
  }
  async payment(c: TenantContext, id: string, input: FinancePaymentInput) {
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: c.organizationId },
      select: { timezone: true },
    });
    if (input.paidOn > today(org.timezone))
      throw new AccessError('INVALID_INPUT');
    const p = await this.db.financePayment.create({
      data: {
        ...input,
        organizationId: c.organizationId,
        recordId: id,
        paidOn: new Date(input.paidOn),
        createdById: c.userId,
      },
    });
    await this.db.financeRecord.update({
      where: { organizationId_id: { organizationId: c.organizationId, id } },
      data: { updatedById: c.userId, updatedAt: new Date() },
    });
    return p.id;
  }
  async reverse(
    c: TenantContext,
    id: string,
    paymentId: string,
    reason: string,
  ) {
    const result = await this.db.financePayment.updateMany({
      where: {
        organizationId: c.organizationId,
        recordId: id,
        id: paymentId,
        reversedAt: null,
      },
      data: {
        reversedAt: new Date(),
        reversedById: c.userId,
        reversalReason: reason,
      },
    });
    if (result.count !== 1) throw new AccessError('CONFLICT');
    await this.db.financeRecord.update({
      where: { organizationId_id: { organizationId: c.organizationId, id } },
      data: { updatedById: c.userId, updatedAt: new Date() },
    });
  }
}
export class PrismaFinanceOperationsUnitOfWork extends FinanceUnitOfWork {
  constructor(private readonly db: PrismaClient) {
    super();
  }
  override async run<T>(
    work: (r: FinanceRepositories) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        (tx) =>
          work({
            finance: new PrismaFinanceOperationsRepository(tx),
            access: new PrismaAccessRepository(tx),
            audit: new PrismaAuditRepository(tx),
          }),
        { isolationLevel: 'Serializable', timeout: 15000 },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034', 'P2010'].includes(e.code)
      )
        throw new AccessError('CONFLICT');
      throw e;
    }
  }
}
