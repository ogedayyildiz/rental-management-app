import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { customers, withTenant, type Database } from '@rental/db';
import { customerInputSchema, type CustomerInput } from '@rental/shared';
import { eq, sql } from 'drizzle-orm';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB } from '../db/db.module.js';
import { OrgId } from '../tenant/tenant.js';

interface Contact {
  name?: string;
  phone?: string;
  email?: string;
}

/** The form edits one main contact; the column holds a list for later. */
function toRow({ contactName, phone, email, ...rest }: Partial<CustomerInput>) {
  const touched = contactName !== undefined || phone !== undefined || email !== undefined;
  return {
    ...rest,
    ...(touched && { contacts: [{ name: contactName || undefined, phone: phone || undefined, email: email || undefined }] }),
  };
}

function fromRow<T extends { contacts: unknown }>({ contacts, ...rest }: T) {
  const main = ((contacts as Contact[] | null) ?? [])[0] ?? {};
  return { ...rest, contactName: main.name ?? null, phone: main.phone ?? null, email: main.email ?? null };
}

@Controller('customers')
export class CustomersController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  list(@OrgId() orgId: string) {
    return withTenant(this.db, orgId, async (tx) => {
      const rows = await tx
        .select({
          id: customers.id,
          companyName: customers.companyName,
          taxNo: customers.taxNo,
          contacts: customers.contacts,
          activeRentals: sql<number>`(
            select count(*)::int from rental_contracts c
            where c.customer_id = "customers"."id" and c.status in ('reserved', 'active'))`,
          openOffers: sql<number>`(
            select count(*)::int from rental_contracts c
            where c.customer_id = "customers"."id" and c.status = 'draft')`,
          outstanding: sql<string>`(
            select coalesce(sum(p.amount), 0) from payments p
            join rental_contracts c on c.id = p.contract_id
            where c.customer_id = "customers"."id" and p.status in ('expected', 'overdue'))`,
        })
        .from(customers)
        .orderBy(customers.companyName);
      return rows.map(fromRow);
    });
  }

  @Get(':id')
  get(@OrgId() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return withTenant(this.db, orgId, async (tx) => {
      const [row] = await tx.select().from(customers).where(eq(customers.id, id));
      if (!row) throw new NotFoundException('Customer not found');
      return fromRow(row);
    });
  }

  @Post()
  create(@OrgId() orgId: string, @Body(new ZodPipe(customerInputSchema)) body: CustomerInput) {
    return withTenant(this.db, orgId, async (tx) => {
      const [row] = await tx
        .insert(customers)
        .values({ organizationId: orgId, ...toRow(body), companyName: body.companyName })
        .returning();
      return fromRow(row!);
    });
  }

  @Patch(':id')
  update(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(customerInputSchema.partial())) body: Partial<CustomerInput>,
  ) {
    return withTenant(this.db, orgId, async (tx) => {
      const [row] = await tx.update(customers).set(toRow(body)).where(eq(customers.id, id)).returning();
      if (!row) throw new NotFoundException('Customer not found');
      return fromRow(row);
    });
  }
}
