import {
  customerFieldsSchema,
  customerPatchSchema,
  customerSearchSchema,
  customerContactSchema,
  customerContactPatchSchema,
  customerAddressSchema,
  customerAddressPatchSchema,
  identifierSchema,
} from '@rental/validation';
import type { TenantPermission } from '@rental/permissions';
import { AccessError } from '../access/contracts.js';
import { AccessService, requirePermission } from '../access/access.service.js';
import type {
  AuthenticatedPrincipal,
  TenantContext,
} from '../access/access.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CustomerUnitOfWork } from './contracts.js';
import type { CustomerRepositories } from './contracts.js';

function id(value: unknown): string {
  const result = identifierSchema.safeParse(value);
  if (!result.success) throw new AccessError('INVALID_INPUT');
  return result.data;
}
export class CustomerService {
  constructor(private readonly unitOfWork: CustomerUnitOfWork) {}
  private run<T>(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    permission: TenantPermission,
    work: (repos: CustomerRepositories, context: TenantContext) => Promise<T>,
  ): Promise<T> {
    return this.unitOfWork.run(async (repos) => {
      const context = await new AccessService(repos.access).tenant(
        principal,
        organizationId,
      );
      requirePermission(context, permission);
      return work(repos, context);
    });
  }
  private async customer(
    repos: CustomerRepositories,
    context: TenantContext,
    customerId: unknown,
    writable = false,
  ) {
    const customer = await repos.customers.find(context, id(customerId));
    if (!customer) throw new AccessError('NOT_FOUND');
    if (writable && !customer.active)
      throw new AccessError('INACTIVE_CUSTOMER');
    return customer;
  }
  list(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    input: unknown,
  ) {
    return this.run(
      principal,
      organizationId,
      'customers.read',
      async (repos, context) => {
        const query = customerSearchSchema.safeParse(input);
        if (!query.success) throw new AccessError('INVALID_INPUT');
        return repos.customers.list(context, query.data);
      },
    );
  }
  get(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    customerId: unknown,
  ) {
    return this.run(principal, organizationId, 'customers.read', (r, c) =>
      this.customer(r, c, customerId),
    );
  }
  create(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    input: unknown,
    requestId: string,
  ) {
    return this.run(
      principal,
      organizationId,
      'customers.create',
      async (repos, context) => {
        const parsed = customerFieldsSchema.safeParse(input);
        if (!parsed.success) throw new AccessError('INVALID_INPUT');
        const customer = await repos.customers.create(context, parsed.data);
        await new AuditService(repos.audit).customerMutation(
          context,
          requestId,
          'CUSTOMER_CREATED',
          'Customer',
          customer.id,
        );
        return customer;
      },
    );
  }
  update(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    customerId: unknown,
    input: unknown,
    requestId: string,
  ) {
    return this.run(
      principal,
      organizationId,
      'customers.update',
      async (repos, context) => {
        const before = await this.customer(repos, context, customerId, true);
        const patch = customerPatchSchema.safeParse(input);
        if (!patch.success) throw new AccessError('INVALID_INPUT');
        const base = customerFieldsSchema.strip().parse(before);
        const parsed = customerFieldsSchema.safeParse({
          ...base,
          ...patch.data,
        });
        if (!parsed.success) throw new AccessError('INVALID_INPUT');
        const customer = await repos.customers.update(
          context,
          before.id,
          parsed.data,
        );
        await new AuditService(repos.audit).customerMutation(
          context,
          requestId,
          'CUSTOMER_UPDATED',
          'Customer',
          customer.id,
        );
        return customer;
      },
    );
  }
  archive(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    customerId: unknown,
    requestId: string,
  ) {
    return this.run(
      principal,
      organizationId,
      'customers.archive',
      async (repos, context) => {
        const before = await this.customer(repos, context, customerId);
        if (!before.active) return before;
        const customer = await repos.customers.archive(context, before.id);
        await new AuditService(repos.audit).customerMutation(
          context,
          requestId,
          'CUSTOMER_ARCHIVED',
          'Customer',
          customer.id,
        );
        return customer;
      },
    );
  }
  contacts(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    customerId: unknown,
  ) {
    return this.run(
      principal,
      organizationId,
      'customers.read',
      async (r, c) => {
        const parent = await this.customer(r, c, customerId);
        return r.customers.contacts(c, parent.id);
      },
    );
  }
  addresses(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    customerId: unknown,
  ) {
    return this.run(
      principal,
      organizationId,
      'customers.read',
      async (r, c) => {
        const parent = await this.customer(r, c, customerId);
        return r.customers.addresses(c, parent.id);
      },
    );
  }
  saveContact(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    customerId: unknown,
    contactId: unknown,
    input: unknown,
    requestId: string,
  ) {
    return this.run(
      principal,
      organizationId,
      'customers.update',
      async (r, c) => {
        const parent = await this.customer(r, c, customerId, true);
        const contact = contactId === null ? null : id(contactId);
        const items = await r.customers.contacts(c, parent.id);
        const before = contact ? items.find((v) => v.id === contact) : null;
        if (contact && !before) throw new AccessError('NOT_FOUND');
        if (!contact && items.length >= 100) throw new AccessError('CONFLICT');
        const patch = customerContactPatchSchema.safeParse(input);
        if (!patch.success) throw new AccessError('INVALID_INPUT');
        const parsed = customerContactSchema.safeParse({
          ...(before ? customerContactSchema.strip().parse(before) : {}),
          ...patch.data,
        });
        if (!parsed.success) throw new AccessError('INVALID_INPUT');
        const result = await r.customers.saveContact(
          c,
          parent.id,
          contact,
          parsed.data,
        );
        await new AuditService(r.audit).customerMutation(
          c,
          requestId,
          contact ? 'CUSTOMER_CONTACT_UPDATED' : 'CUSTOMER_CONTACT_CREATED',
          'CustomerContact',
          result.id,
        );
        return result;
      },
    );
  }
  saveAddress(
    principal: AuthenticatedPrincipal,
    organizationId: unknown,
    customerId: unknown,
    addressId: unknown,
    input: unknown,
    requestId: string,
  ) {
    return this.run(
      principal,
      organizationId,
      'customers.update',
      async (r, c) => {
        const parent = await this.customer(r, c, customerId, true);
        const address = addressId === null ? null : id(addressId);
        const items = await r.customers.addresses(c, parent.id);
        const before = address ? items.find((v) => v.id === address) : null;
        if (address && !before) throw new AccessError('NOT_FOUND');
        if (!address && items.length >= 100) throw new AccessError('CONFLICT');
        const patch = customerAddressPatchSchema.safeParse(input);
        if (!patch.success) throw new AccessError('INVALID_INPUT');
        const parsed = customerAddressSchema.safeParse({
          ...(before ? customerAddressSchema.strip().parse(before) : {}),
          ...patch.data,
        });
        if (!parsed.success) throw new AccessError('INVALID_INPUT');
        const result = await r.customers.saveAddress(
          c,
          parent.id,
          address,
          parsed.data,
        );
        await new AuditService(r.audit).customerMutation(
          c,
          requestId,
          address ? 'CUSTOMER_ADDRESS_UPDATED' : 'CUSTOMER_ADDRESS_CREATED',
          'CustomerAddress',
          result.id,
        );
        return result;
      },
    );
  }
}
