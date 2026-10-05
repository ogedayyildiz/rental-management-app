import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  customers,
  machineModels,
  machines,
  machineState,
  payments,
  rentalContracts,
  rentalItems,
  withTenant,
  type Database,
  type Transaction,
} from '@rental/db';
import {
  rentalDays,
  rentalLineAmount,
  type ContractStatus,
  type OfferInput,
  type PaymentInput,
  type ReceivePaymentInput,
} from '@rental/shared';
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';

/** Inclusive dates → half-open timestamp range [start 00:00, day after end 00:00) in UTC. */
function periodOf(startDate: string, endDate: string) {
  const startAt = new Date(`${startDate}T00:00:00Z`);
  const endAt = new Date(Date.parse(`${endDate}T00:00:00Z`) + 86_400_000);
  return { startAt, endAt };
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Lifecycle: draft (offer) → reserved (confirmed, machines booked) → active
 * (machines out) → completed. Offers and reservations can be cancelled.
 */
@Injectable()
export class RentalsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  list(orgId: string, status?: ContractStatus) {
    return withTenant(this.db, orgId, async (tx) => {
      const rows = await tx
        .select({
          id: rentalContracts.id,
          contractNo: rentalContracts.contractNo,
          status: rentalContracts.status,
          startDate: rentalContracts.startDate,
          plannedEndDate: rentalContracts.plannedEndDate,
          actualEndDate: rentalContracts.actualEndDate,
          totalAmount: rentalContracts.totalAmount,
          customerId: rentalContracts.customerId,
          customerName: customers.companyName,
          machines: sql<string | null>`(
            select string_agg(m.name, ', ' order by m.name) from rental_items i
            join machines m on m.id = i.machine_id
            where i.contract_id = ${rentalContracts.id} and i.cancelled_at is null)`,
          paid: sql<string>`(
            select coalesce(sum(amount), 0) from payments
            where contract_id = ${rentalContracts.id} and status = 'received')`,
          createdAt: rentalContracts.createdAt,
        })
        .from(rentalContracts)
        .innerJoin(customers, eq(customers.id, rentalContracts.customerId))
        .where(status ? eq(rentalContracts.status, status) : undefined)
        .orderBy(desc(rentalContracts.createdAt));
      return rows;
    });
  }

  get(orgId: string, id: string) {
    return withTenant(this.db, orgId, async (tx) => {
      const [contract] = await tx
        .select({
          contract: rentalContracts,
          customer: {
            id: customers.id,
            companyName: customers.companyName,
            taxNo: customers.taxNo,
            address: customers.address,
            contacts: customers.contacts,
          },
        })
        .from(rentalContracts)
        .innerJoin(customers, eq(customers.id, rentalContracts.customerId))
        .where(eq(rentalContracts.id, id));
      if (!contract) throw new NotFoundException('Rental not found');

      const items = await tx
        .select({
          id: rentalItems.id,
          machineId: rentalItems.machineId,
          machineName: machines.name,
          serialNo: machines.serialNo,
          manufacturer: machineModels.manufacturer,
          model: machineModels.model,
          rateType: rentalItems.rateType,
          rate: rentalItems.rate,
          deliveryFee: rentalItems.deliveryFee,
          amount: rentalItems.amount,
          startEngineHours: rentalItems.startEngineHours,
          endEngineHours: rentalItems.endEngineHours,
          cancelledAt: rentalItems.cancelledAt,
        })
        .from(rentalItems)
        .innerJoin(machines, eq(machines.id, rentalItems.machineId))
        .innerJoin(machineModels, eq(machineModels.id, machines.modelId))
        .where(eq(rentalItems.contractId, id))
        .orderBy(asc(machines.name));

      const paymentRows = await tx
        .select()
        .from(payments)
        .where(eq(payments.contractId, id))
        .orderBy(asc(payments.createdAt));

      return { ...contract.contract, customer: contract.customer, items, payments: paymentRows };
    });
  }

  createOffer(orgId: string, input: OfferInput) {
    return withTenant(this.db, orgId, async (tx) => {
      const contractNo = await this.nextContractNo(tx);
      const [contract] = await tx
        .insert(rentalContracts)
        .values({
          organizationId: orgId,
          customerId: input.customerId,
          contractNo,
          status: 'draft',
          ...this.header(input),
        })
        .returning();
      await this.writeLines(tx, orgId, contract!.id, input);
      return contract!;
    });
  }

  updateOffer(orgId: string, id: string, input: OfferInput) {
    return withTenant(this.db, orgId, async (tx) => {
      await this.requireStatus(tx, id, ['draft'], 'Only offers can be edited.');
      await tx
        .update(rentalContracts)
        .set({ customerId: input.customerId, ...this.header(input) })
        .where(eq(rentalContracts.id, id));
      await tx.delete(rentalItems).where(eq(rentalItems.contractId, id));
      await this.writeLines(tx, orgId, id, input);
      return { id };
    });
  }

  /** Customer accepted: the machines are booked for the period. */
  confirm(orgId: string, id: string) {
    return withTenant(this.db, orgId, async (tx) => {
      await this.requireStatus(tx, id, ['draft'], 'Only offers can be confirmed.');

      const conflicts = await tx.execute<{ machine: string; contract_no: string; start_date: string; end_date: string }>(sql`
        select m.name as machine, oc.contract_no, oc.start_date::text, oc.planned_end_date::text as end_date
        from rental_items mine
        join machines m on m.id = mine.machine_id
        join rental_items other on other.machine_id = mine.machine_id
          and other.contract_id <> mine.contract_id
          and other.confirmed and other.cancelled_at is null
          and tstzrange(other.start_at, coalesce(other.end_at, 'infinity'::timestamptz))
              && tstzrange(mine.start_at, coalesce(mine.end_at, 'infinity'::timestamptz))
        join rental_contracts oc on oc.id = other.contract_id
        where mine.contract_id = ${id} and mine.cancelled_at is null
      `);
      if (conflicts.length > 0) {
        const list = conflicts
          .map((c) => `${c.machine} is booked on ${c.contract_no} (${c.start_date} – ${c.end_date})`)
          .join('; ');
        throw new ConflictException(`Cannot confirm: ${list}.`);
      }

      const unusable = await tx
        .select({ name: machines.name, status: machines.status })
        .from(rentalItems)
        .innerJoin(machines, eq(machines.id, rentalItems.machineId))
        .where(
          and(
            eq(rentalItems.contractId, id),
            isNull(rentalItems.cancelledAt),
            inArray(machines.status, ['out_of_service', 'retired']),
          ),
        );
      if (unusable.length > 0) {
        throw new ConflictException(
          `Cannot confirm: ${unusable.map((m) => `${m.name} is ${m.status.replace('_', ' ')}`).join(', ')}.`,
        );
      }

      // The exclusion constraint is the final guard against a concurrent booking.
      await tx
        .update(rentalItems)
        .set({ confirmed: true })
        .where(and(eq(rentalItems.contractId, id), isNull(rentalItems.cancelledAt)));
      await tx.update(rentalContracts).set({ status: 'reserved' }).where(eq(rentalContracts.id, id));
      return { id, status: 'reserved' as const };
    });
  }

  /** Machines leave the depot: they become "rented" and hour meters are recorded. */
  start(orgId: string, id: string) {
    return withTenant(this.db, orgId, async (tx) => {
      await this.requireStatus(tx, id, ['reserved'], 'Only confirmed rentals can be started.');
      const lines = await this.activeLines(tx, id);

      const busy = await tx
        .select({ name: machines.name })
        .from(machines)
        .where(and(inArray(machines.id, lines.map((l) => l.machineId)), eq(machines.status, 'rented')));
      if (busy.length > 0) {
        throw new ConflictException(
          `${busy.map((b) => b.name).join(', ')} is still out on another rental. Complete that rental first.`,
        );
      }

      for (const line of lines) {
        await tx
          .update(rentalItems)
          .set({ startEngineHours: sql`(select engine_hours from machine_state where machine_id = ${line.machineId})` })
          .where(eq(rentalItems.id, line.id));
      }
      await tx
        .update(machines)
        .set({ status: 'rented' })
        .where(inArray(machines.id, lines.map((l) => l.machineId)));
      await tx.update(rentalContracts).set({ status: 'active' }).where(eq(rentalContracts.id, id));
      return { id, status: 'active' as const };
    });
  }

  /** Machines are back: the booking ends today (never extended) and machines are available again. */
  complete(orgId: string, id: string) {
    return withTenant(this.db, orgId, async (tx) => {
      await this.requireStatus(tx, id, ['active'], 'Only active rentals can be completed.');
      const lines = await this.activeLines(tx, id);

      for (const line of lines) {
        await tx
          .update(rentalItems)
          .set({
            endAt: sql`least(coalesce(${rentalItems.endAt}, now()), greatest(now(), ${rentalItems.startAt} + interval '1 second'))`,
            endEngineHours: sql`(select ${machineState.engineHours} from machine_state where machine_id = ${line.machineId})`,
          })
          .where(eq(rentalItems.id, line.id));
      }
      await tx
        .update(machines)
        .set({ status: 'available' })
        .where(and(inArray(machines.id, lines.map((l) => l.machineId)), eq(machines.status, 'rented')));
      await tx
        .update(rentalContracts)
        .set({ status: 'completed', actualEndDate: today() })
        .where(eq(rentalContracts.id, id));
      return { id, status: 'completed' as const };
    });
  }

  cancel(orgId: string, id: string) {
    return withTenant(this.db, orgId, async (tx) => {
      await this.requireStatus(
        tx,
        id,
        ['draft', 'reserved'],
        'Active rentals cannot be cancelled; complete them instead.',
      );
      await tx
        .update(rentalItems)
        .set({ cancelledAt: new Date() })
        .where(and(eq(rentalItems.contractId, id), isNull(rentalItems.cancelledAt)));
      await tx.update(rentalContracts).set({ status: 'cancelled' }).where(eq(rentalContracts.id, id));
      return { id, status: 'cancelled' as const };
    });
  }

  addPayment(orgId: string, contractId: string, input: PaymentInput) {
    return withTenant(this.db, orgId, async (tx) => {
      await this.requireStatus(
        tx,
        contractId,
        ['reserved', 'active', 'completed'],
        'Payments can be added once the offer is confirmed.',
      );
      const [payment] = await tx
        .insert(payments)
        .values({
          organizationId: orgId,
          contractId,
          amount: input.amount.toString(),
          dueDate: input.dueDate,
          method: input.method,
          reference: input.reference,
          note: input.note,
          status: 'expected',
        })
        .returning();
      return payment!;
    });
  }

  receivePayment(orgId: string, paymentId: string, input: ReceivePaymentInput) {
    return withTenant(this.db, orgId, async (tx) => {
      const [payment] = await tx
        .update(payments)
        .set({
          status: 'received',
          receivedAt: input.receivedAt ? new Date(`${input.receivedAt}T12:00:00Z`) : new Date(),
          ...(input.method && { method: input.method }),
          ...(input.reference && { reference: input.reference }),
        })
        .where(and(eq(payments.id, paymentId), ne(payments.status, 'received')))
        .returning();
      if (!payment) throw new NotFoundException('Payment not found or already received');
      return payment;
    });
  }

  // --- helpers --------------------------------------------------------------

  private header(input: OfferInput) {
    const days = rentalDays(input.startDate, input.endDate);
    const total = input.items.reduce((sum, line) => sum + rentalLineAmount(line, days), 0);
    return {
      startDate: input.startDate,
      plannedEndDate: input.endDate,
      siteAddress: input.siteAddress || null,
      terms: input.terms || null,
      totalAmount: total.toFixed(2),
    };
  }

  private async writeLines(tx: Transaction, orgId: string, contractId: string, input: OfferInput) {
    const found = await tx
      .select({ id: machines.id, status: machines.status })
      .from(machines)
      .where(inArray(machines.id, input.items.map((i) => i.machineId)));
    if (found.length !== input.items.length) throw new BadRequestException('Unknown machine in offer');
    if (found.some((m) => m.status === 'retired')) throw new BadRequestException('A retired machine cannot be offered');

    const days = rentalDays(input.startDate, input.endDate);
    const { startAt, endAt } = periodOf(input.startDate, input.endDate);
    await tx.insert(rentalItems).values(
      input.items.map((line) => ({
        organizationId: orgId,
        contractId,
        machineId: line.machineId,
        rateType: line.rateType,
        rate: line.rate.toString(),
        deliveryFee: line.deliveryFee.toString(),
        amount: rentalLineAmount(line, days).toFixed(2),
        startAt,
        endAt,
        confirmed: false,
      })),
    );
  }

  private async requireStatus(tx: Transaction, id: string, allowed: ContractStatus[], message: string) {
    const [row] = await tx
      .select({ status: rentalContracts.status })
      .from(rentalContracts)
      .where(eq(rentalContracts.id, id));
    if (!row) throw new NotFoundException('Rental not found');
    if (!allowed.includes(row.status)) throw new ConflictException(message);
  }

  private activeLines(tx: Transaction, contractId: string) {
    return tx
      .select({ id: rentalItems.id, machineId: rentalItems.machineId })
      .from(rentalItems)
      .where(and(eq(rentalItems.contractId, contractId), isNull(rentalItems.cancelledAt)));
  }

  /** RC-<year>-<sequence>, per organization. */
  private async nextContractNo(tx: Transaction): Promise<string> {
    const prefix = `RC-${new Date().getFullYear()}-`;
    const [row] = await tx.execute<{ next: number }>(sql`
      select coalesce(max(substring(contract_no from '[0-9]+$')::int), 0) + 1 as next
      from rental_contracts where contract_no like ${prefix + '%'}
    `);
    return `${prefix}${String(row?.next ?? 1).padStart(4, '0')}`;
  }
}
