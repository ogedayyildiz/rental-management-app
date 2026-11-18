import type { AnalyticsQuery } from '@rental/validation';
import type { TenantContext } from '../access/access.service.js';
import type { AccessRepository } from '../access/contracts.js';

export interface FinanceMachine {
  id: string;
  fleetNumber: string;
  modelId: string;
  model: string;
  categoryId: string;
  category: string;
  branchId: string | null;
  branch: string | null;
  acquisitionDate: string | null;
  createdAt: string;
  lifecycleState: string;
  rentalState: string;
  serviceState: string;
  acquisitionCost?: string | null;
  currency?: string | null;
}
export interface FinanceTerm {
  plannedStartAt: string;
  plannedEndAt: string;
  agreedRate: string;
  rateUnit:
    'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'FIXED_PERIOD' | 'MANUAL';
  currency: string;
}
export interface FinanceAssignment {
  id: string;
  machineId: string;
  releasedAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
}
export interface FinanceItem {
  id: string;
  quantity: number;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  agreedRate?: string | null;
  rateUnit?: FinanceTerm['rateUnit'] | null;
  currency?: string | null;
  terms: FinanceTerm[];
  assignments: FinanceAssignment[];
}
export interface FinanceRental {
  id: string;
  number: string;
  customerId: string;
  customer: string;
  branchId: string | null;
  status: string;
  items: FinanceItem[];
}
export interface FinanceWorkOrder {
  id: string;
  machineId: string;
  status: string;
  occurredAt: string;
  costs: { kind: string; currency: string; amount: string }[];
}
export interface FinanceSnapshot {
  machines: FinanceMachine[];
  rentals: FinanceRental[];
  workOrders: FinanceWorkOrder[];
}
export interface FinanceVisibility {
  acquisition: boolean;
  pricing: boolean;
  costs: boolean;
  rentals: boolean;
  maintenance: boolean;
  customers: boolean;
  export: boolean;
}
export interface FinanceReadRepository {
  timezone(c: TenantContext): Promise<string>;
  snapshot(
    c: TenantContext,
    q: AnalyticsQuery,
    v: FinanceVisibility,
  ): Promise<FinanceSnapshot>;
}
export abstract class FinanceUnitOfWork {
  abstract read<T>(
    work: (repositories: {
      access: AccessRepository;
      finance: FinanceReadRepository;
    }) => Promise<T>,
  ): Promise<T>;
}
