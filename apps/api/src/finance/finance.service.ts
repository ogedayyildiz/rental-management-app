import { Decimal } from 'decimal.js';
import {
  identifierSchema,
  financeRecordInputSchema,
  financeRecordEditSchema,
  financeRecordsQuerySchema,
  financeVersionSchema,
  financeCancelSchema,
  financeDocumentSchema,
  financePaymentInputSchema,
  financeReverseSchema,
  type FinanceView,
} from '@rental/validation';
import {
  AccessService,
  requirePermission,
  type AuthenticatedPrincipal,
  type TenantContext,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type { AuditRecord } from '../audit/audit.service.js';
import type { FinanceRepositories, FinanceUnitOfWork } from './contracts.js';
const D = Decimal.clone({ precision: 60 });
function parse<T>(
  schema: {
    safeParse(v: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new AccessError('INVALID_INPUT');
  return r.data;
}
export class FinanceOperationsService {
  constructor(private readonly unit: FinanceUnitOfWork) {}
  private run<T>(
    p: AuthenticatedPrincipal,
    org: unknown,
    write: boolean,
    work: (r: FinanceRepositories, c: TenantContext) => Promise<T>,
  ) {
    return this.unit.run(async (r) => {
      let c = await new AccessService(r.access).tenant(p, org);
      if (write) {
        await r.finance.lock(c);
        c = await new AccessService(r.access).tenant(p, org);
      }
      return work(r, c);
    });
  }
  private permission(
    c: TenantContext,
    kind: FinanceView['kind'],
    write = false,
  ) {
    requirePermission(
      c,
      kind === 'PAYABLE' ? 'finance.payables.view' : 'finance.receivables.view',
    );
    requirePermission(
      c,
      kind === 'PAYABLE' ? 'machines.read' : 'customers.read',
    );
    if (kind === 'PAYABLE')
      requirePermission(c, 'finance.acquisition_cost.view');
    if (write)
      requirePermission(
        c,
        kind === 'PAYABLE'
          ? 'finance.payables.manage'
          : 'finance.receivables.manage',
      );
  }
  private async row(
    r: FinanceRepositories,
    c: TenantContext,
    id: unknown,
    write = false,
  ) {
    const row = await r.finance.find(c, parse(identifierSchema, id));
    if (!row) throw new AccessError('NOT_FOUND');
    this.permission(c, row.kind, write);
    return row;
  }
  private version(row: FinanceView, version: string) {
    if (row.updatedAt !== version) throw new AccessError('CONFLICT');
  }
  private async audit(
    r: FinanceRepositories,
    c: TenantContext,
    requestId: string,
    id: string,
    action: AuditRecord['action'],
    payment = false,
  ) {
    await r.audit.append({
      organizationId: c.organizationId,
      actorUserId: c.userId,
      actorType: 'USER',
      targetType: payment ? 'FinancePayment' : 'FinanceRecord',
      targetId: id,
      action,
      requestId: parse(identifierSchema, requestId),
      source: 'api',
      result: 'SUCCESS',
      metadata: {},
    });
  }
  branches(p: AuthenticatedPrincipal, org: unknown, query: unknown) {
    return this.run(p, org, false, async (r, c) => {
      const q = parse(financeRecordsQuerySchema, query);
      this.permission(c, q.kind);
      return r.finance.branches(c);
    });
  }
  list(p: AuthenticatedPrincipal, org: unknown, query: unknown) {
    return this.run(p, org, false, async (r, c) => {
      const q = parse(financeRecordsQuerySchema, query);
      this.permission(c, q.kind);
      return r.finance.list(c, q);
    });
  }
  balances(p: AuthenticatedPrincipal, org: unknown, query: unknown) {
    return this.run(p, org, false, async (r, c) => {
      const q = parse(financeRecordsQuerySchema, query);
      this.permission(c, q.kind);
      return r.finance.balances(c, q);
    });
  }
  get(p: AuthenticatedPrincipal, org: unknown, id: unknown) {
    return this.run(p, org, false, (r, c) => this.row(r, c, id));
  }
  create(
    p: AuthenticatedPrincipal,
    org: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, org, true, async (r, c) => {
      const input = parse(financeRecordInputSchema, body);
      this.permission(c, input.kind, true);
      await r.finance.requireSources(c, input);
      const row = await r.finance.save(c, null, input);
      await this.audit(r, c, requestId, row.id, 'FINANCE_RECORD_CREATED');
      return row;
    });
  }
  update(
    p: AuthenticatedPrincipal,
    org: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, org, true, async (r, c) => {
      const row = await this.row(r, c, id, true),
        input = parse(financeRecordEditSchema, body);
      this.version(row, input.version);
      if (row.status !== 'DRAFT' || row.kind !== input.record.kind)
        throw new AccessError('INVALID_TRANSITION');
      await r.finance.requireSources(c, input.record);
      const next = await r.finance.save(c, row.id, input.record);
      await this.audit(r, c, requestId, row.id, 'FINANCE_RECORD_UPDATED');
      return next;
    });
  }
  confirm(
    p: AuthenticatedPrincipal,
    org: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, org, true, async (r, c) => {
      const row = await this.row(r, c, id, true);
      this.version(row, parse(financeVersionSchema, body).version);
      if (row.status !== 'DRAFT') throw new AccessError('INVALID_TRANSITION');
      await r.finance.requireSources(c, row);
      if (
        !row.installments.length ||
        !row.installments
          .reduce((sum, i) => sum.plus(i.amount), new D(0))
          .eq(row.grossAmount)
      )
        throw new AccessError('INVALID_INPUT');
      if (
        row.acquisitionMethod === 'LEASING' &&
        !row.installments.some((i) => i.kind === 'INSTALLMENT')
      )
        throw new AccessError('INVALID_INPUT');
      const next = await r.finance.transition(c, row.id, 'CONFIRMED');
      await this.audit(r, c, requestId, row.id, 'FINANCE_RECORD_CONFIRMED');
      return next;
    });
  }
  cancel(
    p: AuthenticatedPrincipal,
    org: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, org, true, async (r, c) => {
      const row = await this.row(r, c, id, true),
        input = parse(financeCancelSchema, body);
      this.version(row, input.version);
      if (row.status === 'CANCELLED' || row.payments.some((x) => !x.reversedAt))
        throw new AccessError('INVALID_TRANSITION');
      const next = await r.finance.transition(
        c,
        row.id,
        'CANCELLED',
        input.reason,
      );
      await this.audit(r, c, requestId, row.id, 'FINANCE_RECORD_CANCELLED');
      return next;
    });
  }
  document(
    p: AuthenticatedPrincipal,
    org: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, org, true, async (r, c) => {
      const row = await this.row(r, c, id, true);
      if (row.status === 'CANCELLED')
        throw new AccessError('INVALID_TRANSITION');
      const next = await r.finance.document(
        c,
        row.id,
        parse(financeDocumentSchema, body),
      );
      await this.audit(r, c, requestId, row.id, 'FINANCE_DOCUMENT_UPDATED');
      return next;
    });
  }
  pay(
    p: AuthenticatedPrincipal,
    org: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, org, true, async (r, c) => {
      const row = await this.row(r, c, id);
      requirePermission(c, 'finance.payments.record');
      const input = parse(financePaymentInputSchema, body),
        existing = await r.finance.paymentByKey(c, input.idempotencyKey);
      if (existing) {
        if (
          existing.recordId !== row.id ||
          existing.installmentId !== input.installmentId ||
          !new D(existing.amount).eq(input.amount) ||
          existing.currency !== input.currency ||
          existing.paidOn !== input.paidOn ||
          existing.method !== input.method ||
          existing.reference !== input.reference
        )
          throw new AccessError('CONFLICT');
        return row;
      }
      if (row.status !== 'CONFIRMED')
        throw new AccessError('INVALID_TRANSITION');
      const installment = row.installments.find(
        (i) => i.id === input.installmentId,
      );
      if (
        !installment ||
        input.currency !== row.currency ||
        new D(input.amount).gt(installment.remainingAmount)
      )
        throw new AccessError('INVALID_INPUT');
      const paymentId = await r.finance.payment(c, row.id, input);
      await this.audit(
        r,
        c,
        requestId,
        paymentId,
        'FINANCE_PAYMENT_RECORDED',
        true,
      );
      return this.row(r, c, row.id);
    });
  }
  reverse(
    p: AuthenticatedPrincipal,
    org: unknown,
    id: unknown,
    paymentId: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, org, true, async (r, c) => {
      const row = await this.row(r, c, id);
      requirePermission(c, 'finance.payments.reverse');
      const payment = row.payments.find(
        (x) => x.id === parse(identifierSchema, paymentId),
      );
      if (!payment) throw new AccessError('NOT_FOUND');
      const input = parse(financeReverseSchema, body);
      if (payment.reversedAt) return row;
      await r.finance.reverse(c, row.id, payment.id, input.reason);
      await this.audit(
        r,
        c,
        requestId,
        payment.id,
        'FINANCE_PAYMENT_REVERSED',
        true,
      );
      return this.row(r, c, row.id);
    });
  }
}
