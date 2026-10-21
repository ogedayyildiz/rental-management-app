import type {
  RentalView,
  RentalItemInput,
  RentalInput,
  RentalPatch,
  RentalStatus,
  RentalRateUnit,
  RentalSearch,
  RentalCatalog,
} from '@rental/validation';
import type { TenantContext } from '../access/access.service.js';
import type { AccessRepository } from '../access/contracts.js';
import type { AuditRepository } from '../audit/audit.service.js';
export interface RentalMachine {
  id: string;
  fleetNumber: string;
  manufacturer: string;
  model: string;
  category: string;
  categoryId: string;
  modelId: string;
  branchId: string | null;
  lifecycleState: string;
  serviceState: string;
  specifications: Record<string, string | number | undefined>;
  createdAt: string;
}
export interface RentalRepository {
  lock(organizationId: string): Promise<void>;
  catalog(c: TenantContext): Promise<RentalCatalog>;
  list(
    c: TenantContext,
    q: RentalSearch,
  ): Promise<{ items: RentalView[]; nextCursor: string | null }>;
  find(c: TenantContext, id: string): Promise<RentalView | null>;
  commitments(c: TenantContext): Promise<RentalView[]>;
  machines(c: TenantContext): Promise<RentalMachine[]>;
  hasActualConflict(
    c: TenantContext,
    machineId: string,
    start: string,
    excludeId?: string,
  ): Promise<boolean>;
  requireCustomer(c: TenantContext, id: string): Promise<void>;
  create(c: TenantContext, input: RentalInput): Promise<RentalView>;
  edit(c: TenantContext, id: string, input: RentalPatch): Promise<void>;
  addItems(
    c: TenantContext,
    id: string,
    items: RentalItemInput[],
  ): Promise<void>;
  setStatus(
    c: TenantContext,
    id: string,
    status: RentalStatus,
    extra?: {
      actualStartAt?: string;
      actualEndAt?: string;
      cancelledAt?: string;
      cancellationReason?: string;
    },
  ): Promise<void>;
  assign(c: TenantContext, itemId: string, machineId: string): Promise<void>;
  release(
    c: TenantContext,
    id: string,
    reason: string,
    time: string,
  ): Promise<void>;
  start(c: TenantContext, id: string, time: string): Promise<void>;
  end(c: TenantContext, id: string, time: string): Promise<void>;
  extend(c: TenantContext, itemId: string, end: string): Promise<void>;
  term(
    c: TenantContext,
    itemId: string,
    input: {
      plannedStartAt: string;
      plannedEndAt: string;
      agreedRate: string;
      rateUnit: RentalRateUnit;
      currency: string;
    },
  ): Promise<void>;
  refreshDates(c: TenantContext, id: string): Promise<void>;
}
// Machine owns its storage adapter; Rental supplies the derived state within the shared transaction.
export interface RentalMachineStateWriter {
  set(
    c: TenantContext,
    id: string,
    state: 'NOT_RENTED' | 'RESERVED' | 'RENTED',
  ): Promise<void>;
}
export interface RentalRepositories {
  access: AccessRepository;
  rentals: RentalRepository;
  machines: RentalMachineStateWriter;
  audit: AuditRepository;
}
export abstract class RentalUnitOfWork {
  abstract run<T>(work: (r: RentalRepositories) => Promise<T>): Promise<T>;
}
