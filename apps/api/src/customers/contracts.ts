import type {
  AddressInput,
  AddressView,
  ContactInput,
  ContactView,
  CustomerInput,
  CustomerPage,
  CustomerSearch,
  CustomerView,
} from '@rental/validation';
import type { TenantContext } from '../access/access.service.js';
import type { AccessRepository } from '../access/contracts.js';
import type { AuditRepository } from '../audit/audit.service.js';

export interface CustomerRepository {
  list(context: TenantContext, query: CustomerSearch): Promise<CustomerPage>;
  find(context: TenantContext, id: string): Promise<CustomerView | null>;
  create(context: TenantContext, input: CustomerInput): Promise<CustomerView>;
  update(
    context: TenantContext,
    id: string,
    input: CustomerInput,
  ): Promise<CustomerView>;
  archive(context: TenantContext, id: string): Promise<CustomerView>;
  contacts(context: TenantContext, customerId: string): Promise<ContactView[]>;
  saveContact(
    context: TenantContext,
    customerId: string,
    id: string | null,
    input: ContactInput,
  ): Promise<ContactView>;
  addresses(context: TenantContext, customerId: string): Promise<AddressView[]>;
  saveAddress(
    context: TenantContext,
    customerId: string,
    id: string | null,
    input: AddressInput,
  ): Promise<AddressView>;
}
export interface CustomerRepositories {
  access: AccessRepository;
  customers: CustomerRepository;
  audit: AuditRepository;
}
export abstract class CustomerUnitOfWork {
  abstract run<T>(
    work: (repositories: CustomerRepositories) => Promise<T>,
  ): Promise<T>;
}
