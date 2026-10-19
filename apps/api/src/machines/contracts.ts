import type {
  MachineInput,
  MachineSearch,
  MachineView,
  MachinePage,
} from '@rental/validation';
import type { TenantContext } from '../access/access.service.js';
import type { AccessRepository } from '../access/contracts.js';
import type { AuditRepository } from '../audit/audit.service.js';
export interface MachineRepository {
  list(context: TenantContext, query: MachineSearch): Promise<MachinePage>;
  find(context: TenantContext, id: string): Promise<MachineView | null>;
  branches(context: TenantContext): Promise<{ id: string; name: string }[]>;
  requireBranch(context: TenantContext, id: string | null): Promise<void>;
  save(
    context: TenantContext,
    id: string | null,
    input: MachineInput,
  ): Promise<MachineView>;
  archive(
    context: TenantContext,
    id: string,
    state: 'SOLD' | 'RETIRED',
  ): Promise<MachineView>;
}
export interface MachineRepositories {
  access: AccessRepository;
  machines: MachineRepository;
  audit: AuditRepository;
}
export abstract class MachineUnitOfWork {
  abstract run<T>(work: (repos: MachineRepositories) => Promise<T>): Promise<T>;
}
