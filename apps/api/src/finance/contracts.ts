import type {
  FinanceInput,
  FinanceView,
  FinanceQuery,
  FinancePaymentInput,
  FinanceDocument,
} from '@rental/validation';
import type { TenantContext } from '../access/access.service.js';
import type { AccessRepository } from '../access/contracts.js';
import type { AuditRepository } from '../audit/audit.service.js';
export interface FinanceRepository {
  lock(c: TenantContext): Promise<void>;
  branches(c: TenantContext): Promise<{ id: string; name: string }[]>;
  list(
    c: TenantContext,
    q: FinanceQuery,
  ): Promise<{ items: FinanceView[]; nextCursor: string | null }>;
  balances(
    c: TenantContext,
    q: FinanceQuery,
  ): Promise<
    {
      currency: string;
      grossAmount: string;
      paidAmount: string;
      remainingAmount: string;
    }[]
  >;
  find(c: TenantContext, id: string): Promise<FinanceView | null>;
  requireSources(
    c: TenantContext,
    input: Pick<
      FinanceInput,
      'kind' | 'customerId' | 'machineId' | 'rentalId' | 'branchId'
    >,
  ): Promise<void>;
  save(
    c: TenantContext,
    id: string | null,
    input: FinanceInput,
  ): Promise<FinanceView>;
  transition(
    c: TenantContext,
    id: string,
    status: 'CONFIRMED' | 'CANCELLED',
    reason?: string,
  ): Promise<FinanceView>;
  document(
    c: TenantContext,
    id: string,
    input: FinanceDocument,
  ): Promise<FinanceView>;
  payment(
    c: TenantContext,
    id: string,
    input: FinancePaymentInput,
  ): Promise<string>;
  paymentByKey(
    c: TenantContext,
    key: string,
  ): Promise<(FinancePaymentInput & { id: string; recordId: string }) | null>;
  reverse(
    c: TenantContext,
    id: string,
    paymentId: string,
    reason: string,
  ): Promise<void>;
}
export interface FinanceRepositories {
  access: AccessRepository;
  finance: FinanceRepository;
  audit: AuditRepository;
}
export abstract class FinanceUnitOfWork {
  abstract run<T>(work: (r: FinanceRepositories) => Promise<T>): Promise<T>;
}
