import type {
  WorkOrderInput,
  WorkOrderPatch,
  WorkOrderView,
  MaintenanceSearch,
  MaintenancePlanInput,
  MachineView,
} from '@rental/validation';
import type { TenantContext } from '../access/access.service.js';
import type { AccessRepository } from '../access/contracts.js';
import type { AuditRepository } from '../audit/audit.service.js';
export interface MaintenanceRepository {
  schedules(
    c: TenantContext,
    machineId: string,
  ): Promise<
    {
      id: string;
      machineId: string;
      planId: string;
      nextDueAt: string;
      active: boolean;
      planName: string;
      fleetNumber: string;
    }[]
  >;
  saveSchedule(
    c: TenantContext,
    input: {
      machineId: string;
      planId: string;
      nextDueAt: string;
      active: boolean;
    },
  ): Promise<string>;
  advanceSchedule(c: TenantContext, id: string, now: Date): Promise<void>;

  lock(c: TenantContext): Promise<void>;
  checkSchedule(
    c: TenantContext,
    from: string,
    to: string,
    now: Date,
  ): Promise<void>;
  machine(c: TenantContext, id: string): Promise<MachineView | null>;
  find(c: TenantContext, id: string, now: Date): Promise<WorkOrderView | null>;
  list(
    c: TenantContext,
    q: MaintenanceSearch,
    now: Date,
  ): Promise<{ items: WorkOrderView[]; nextCursor: string | null }>;
  validateReferences(c: TenantContext, input: WorkOrderInput): Promise<void>;
  create(c: TenantContext, input: WorkOrderInput, now: Date): Promise<string>;
  update(c: TenantContext, id: string, input: WorkOrderPatch): Promise<void>;
  transition(
    c: TenantContext,
    id: string,
    status: WorkOrderView['status'],
    now: Date,
    notes?: string,
    reason?: string,
  ): Promise<void>;
  restrictions(
    c: TenantContext,
    machineId: string,
  ): Promise<
    {
      id: string;
      state: MachineView['serviceState'];
      workOrderId: string | null;
    }[]
  >;
  block(
    c: TenantContext,
    machineId: string,
    state: MachineView['serviceState'],
    reason: string,
    workOrderId?: string,
  ): Promise<string>;
  release(
    c: TenantContext,
    id: string,
    reason: string,
    now: Date,
  ): Promise<void>;
  project(
    c: TenantContext,
    machineId: string,
    state: MachineView['serviceState'],
  ): Promise<void>;
  task(
    c: TenantContext,
    workOrderId: string,
    id: string,
    completed: boolean,
    notes: string | null,
    now: Date,
  ): Promise<void>;
  material(
    c: TenantContext,
    id: string,
    input: {
      description: string;
      partNumber: string | null;
      quantity: string;
      unit: string;
    },
  ): Promise<void>;
  cost(
    c: TenantContext,
    id: string,
    input: {
      kind: 'LABOR' | 'PARTS' | 'EXTERNAL_SERVICE' | 'TRANSPORT' | 'OTHER';
      amount: string;
      currency: string;
      description: string | null;
    },
  ): Promise<void>;
  plans(c: TenantContext): Promise<({ id: string } & MaintenancePlanInput)[]>;
  savePlan(
    c: TenantContext,
    id: string | null,
    input: MaintenancePlanInput,
  ): Promise<string>;
}
export interface MaintenanceRepositories {
  access: AccessRepository;
  audit: AuditRepository;
  maintenance: MaintenanceRepository;
}
export abstract class MaintenanceUnitOfWork {
  abstract run<T>(work: (r: MaintenanceRepositories) => Promise<T>): Promise<T>;
}
