import { randomUUID } from 'node:crypto';
import { Prisma } from '@rental/database';
import type { PrismaClient } from '@rental/database';
import type {
  AddressInput,
  ContactInput,
  CustomerInput,
  CustomerSearch,
} from '@rental/validation';
import { assertTenantContext } from '../access/access.service.js';
import type { TenantContext } from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import { CustomerUnitOfWork } from '../customers/contracts.js';
import type {
  CustomerRepositories,
  CustomerRepository,
} from '../customers/contracts.js';
import {
  PrismaAccessRepository,
  PrismaAuditRepository,
} from './prisma.repositories.js';

function dates<T extends { createdAt: Date; updatedAt: Date }>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
const phoneDigits = (value: string | null) => value?.replace(/\D/g, '') || null;
export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}
  private scope(context: TenantContext) {
    assertTenantContext(context);
    return { organizationId: context.organizationId };
  }
  async list(context: TenantContext, query: CustomerSearch) {
    const digits = phoneDigits(query.q);
    const normalizedIdentifier = query.q.replace(/[ .-]/g, '').toUpperCase();
    const contains = { contains: query.q, mode: 'insensitive' as const };
    const search: Prisma.CustomerWhereInput = query.q
      ? {
          OR: [
            { displayName: contains },
            { legalName: contains },
            { customerNumber: contains },
            { primaryEmail: contains },
            ...(normalizedIdentifier
              ? [{ identifierValue: { contains: normalizedIdentifier } }]
              : []),
            ...(digits ? [{ phoneSearch: { contains: digits } }] : []),
            {
              contacts: {
                some: {
                  OR: [
                    { name: contains },
                    { email: contains },
                    ...(digits ? [{ phoneSearch: { contains: digits } }] : []),
                  ],
                },
              },
            },
          ],
        }
      : {};
    const [time, cursorId] = query.cursor?.split('|') ?? [];
    const cursor: Prisma.CustomerWhereInput =
      time && cursorId
        ? {
            OR: [
              { createdAt: { lt: new Date(time) } },
              { createdAt: new Date(time), id: { lt: cursorId } },
            ],
          }
        : {};
    const rows = await this.db.customer.findMany({
      where: {
        ...this.scope(context),
        ...(query.status === 'ALL'
          ? {}
          : { active: query.status === 'ACTIVE' }),
        AND: [search, cursor],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      omit: { phoneSearch: true },
    });
    const more = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map(dates);
    const last = items.at(-1);
    return {
      items,
      nextCursor: more && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  async find(context: TenantContext, id: string) {
    const row = await this.db.customer.findFirst({
      where: { ...this.scope(context), id },
      omit: { phoneSearch: true },
    });
    return row ? dates(row) : null;
  }
  async create(context: TenantContext, input: CustomerInput) {
    const row = await this.db.customer.create({
      data: {
        ...this.scope(context),
        ...input,
        phoneSearch: phoneDigits(input.primaryPhone),
        customerNumber: `C-${randomUUID()}`,
        createdById: context.userId,
        updatedById: context.userId,
      },
      omit: { phoneSearch: true },
    });
    return dates(row);
  }
  async update(context: TenantContext, id: string, input: CustomerInput) {
    const rows = await this.db.customer.updateManyAndReturn({
      where: { ...this.scope(context), id, active: true },
      data: {
        ...input,
        phoneSearch: phoneDigits(input.primaryPhone),
        updatedById: context.userId,
      },
      omit: { phoneSearch: true },
    });
    if (!rows[0]) throw new AccessError('CONFLICT');
    return dates(rows[0]);
  }
  async archive(context: TenantContext, id: string) {
    const rows = await this.db.customer.updateManyAndReturn({
      where: { ...this.scope(context), id, active: true },
      data: { active: false, updatedById: context.userId },
      omit: { phoneSearch: true },
    });
    if (!rows[0]) throw new AccessError('CONFLICT');
    return dates(rows[0]);
  }
  async contacts(context: TenantContext, customerId: string) {
    return (
      await this.db.customerContact.findMany({
        where: { ...this.scope(context), customerId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
        omit: { phoneSearch: true },
      })
    ).map(dates);
  }
  async saveContact(
    context: TenantContext,
    customerId: string,
    id: string | null,
    input: ContactInput,
  ) {
    const scope = { ...this.scope(context), customerId };
    const data = { ...input, phoneSearch: phoneDigits(input.phone) };
    if (!id)
      return dates(
        await this.db.customerContact.create({
          data: { ...scope, ...data },
          omit: { phoneSearch: true },
        }),
      );
    const rows = await this.db.customerContact.updateManyAndReturn({
      where: { ...scope, id },
      data,
      omit: { phoneSearch: true },
    });
    if (!rows[0]) throw new AccessError('NOT_FOUND');
    return dates(rows[0]);
  }
  async addresses(context: TenantContext, customerId: string) {
    return (
      await this.db.customerAddress.findMany({
        where: { ...this.scope(context), customerId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
      })
    ).map(dates);
  }
  async saveAddress(
    context: TenantContext,
    customerId: string,
    id: string | null,
    input: AddressInput,
  ) {
    const scope = { ...this.scope(context), customerId };
    if (!id)
      return dates(
        await this.db.customerAddress.create({ data: { ...scope, ...input } }),
      );
    const rows = await this.db.customerAddress.updateManyAndReturn({
      where: { ...scope, id },
      data: input,
    });
    if (!rows[0]) throw new AccessError('NOT_FOUND');
    return dates(rows[0]);
  }
}
export class PrismaCustomerUnitOfWork extends CustomerUnitOfWork {
  constructor(private readonly db: PrismaClient) {
    super();
  }
  override async run<T>(
    work: (repos: CustomerRepositories) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(
        (tx) =>
          work({
            access: new PrismaAccessRepository(tx),
            customers: new PrismaCustomerRepository(tx),
            audit: new PrismaAuditRepository(tx),
          }),
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new AccessError('CONFLICT');
      throw error;
    }
  }
}
