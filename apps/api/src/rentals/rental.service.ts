import {
  rentalReplaceSchema,
  rentalCreateSchema,
  rentalPatchSchema,
  rentalSearchSchema,
  rentalAvailabilitySchema,
  rentalAssignSchema,
  rentalReleaseSchema,
  rentalDispatchSchema,
  rentalReturnSchema,
  rentalExtendSchema,
  rentalCancelSchema,
  identifierSchema,
} from '@rental/validation';
import type { RentalView, RentalItemInput } from '@rental/validation';
import type { TenantPermission } from '@rental/permissions';
import { AccessService, requirePermission } from '../access/access.service.js';
import type {
  AuthenticatedPrincipal,
  TenantContext,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type { AuditRecord } from '../audit/audit.service.js';
import type {
  RentalUnitOfWork,
  RentalRepositories,
  RentalMachine,
} from './contracts.js';
import {
  assertSchedule,
  serviceAllowsDispatch,
  matches,
} from './availability.js';
function parse<T>(
  schema: {
    safeParse(v: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AccessError('INVALID_INPUT');
  return result.data;
}
const liveItems = (row: RentalView) => row.items.filter((i) => !i.removedAt);
const liveAssignments = (row: RentalView) =>
  liveItems(row).flatMap((i) => i.assignments.filter((a) => !a.releasedAt));
export class RentalService {
  constructor(
    private readonly unit: RentalUnitOfWork,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private run<T>(
    p: AuthenticatedPrincipal,
    org: unknown,
    permission: TenantPermission,
    write: boolean,
    work: (r: RentalRepositories, c: TenantContext) => Promise<T>,
  ): Promise<T> {
    return this.unit.run(async (r) => {
      const c = await new AccessService(r.access).tenant(p, org);
      requirePermission(c, permission);
      if (write) {
        await r.rentals.lock(c.organizationId);
        const current = await new AccessService(r.access).tenant(p, org);
        requirePermission(current, permission);
        return work(r, current);
      }
      return work(r, c);
    });
  }
  private visible(c: TenantContext, row: RentalView): RentalView {
    if (c.permissions.includes('rentals.pricing.view')) return row;
    return {
      ...row,
      items: row.items.map((item) => {
        const {
          agreedRate,
          rateUnit,
          currency,
          commercialNotes,
          terms,
          ...rest
        } = item;
        void agreedRate;
        void rateUnit;
        void currency;
        void commercialNotes;
        void terms;
        return rest;
      }),
    };
  }
  private async getRow(r: RentalRepositories, c: TenantContext, id: unknown) {
    const row = await r.rentals.find(c, parse(identifierSchema, id));
    if (!row) throw new AccessError('NOT_FOUND');
    return row;
  }
  private async audit(
    r: RentalRepositories,
    c: TenantContext,
    requestId: string,
    id: string,
    action: AuditRecord['action'],
    metadata: AuditRecord['metadata'] = {},
  ) {
    parse(identifierSchema, requestId);
    await r.audit.append({
      organizationId: c.organizationId,
      actorUserId: c.userId,
      actorType: 'USER',
      action,
      targetType: 'Rental',
      targetId: id,
      result: 'SUCCESS',
      source: 'api',
      requestId,
      metadata,
    });
  }
  private allowedBranch(c: TenantContext, branchId: string | null) {
    if (
      c.branchScope !== 'ALL_BRANCHES' &&
      (!branchId || !c.branchIds.includes(branchId))
    )
      throw new AccessError('ACCESS_DENIED');
  }
  private async branch(
    r: RentalRepositories,
    c: TenantContext,
    branchId: string | null,
  ) {
    this.allowedBranch(c, branchId);
    if (
      branchId &&
      !(await r.rentals.catalog(c)).branches.some((b) => b.id === branchId)
    )
      throw new AccessError('NOT_FOUND');
  }
  private pricing(c: TenantContext, items: RentalItemInput[]) {
    if (
      items.some((i) =>
        ['agreedRate', 'rateUnit', 'currency', 'commercialNotes'].some(
          (k) => k in i,
        ),
      )
    )
      requirePermission(c, 'rentals.pricing.edit');
  }
  private async validateItems(
    r: RentalRepositories,
    c: TenantContext,
    branchId: string | null,
    items: RentalItemInput[],
    eligible = false,
  ) {
    const catalog = await r.rentals.catalog(c),
      machines = await r.rentals.machines(c);
    const selected = new Set<string>();
    for (const item of items) {
      if (
        item.requestedCategoryId &&
        !catalog.categories.some((x) => x.id === item.requestedCategoryId)
      )
        throw new AccessError('NOT_FOUND');
      if (item.requestedModelId) {
        const model = catalog.models.find(
          (x) => x.id === item.requestedModelId,
        );
        if (!model) throw new AccessError('NOT_FOUND');
        if (
          item.requestedCategoryId &&
          model.categoryId !== item.requestedCategoryId
        )
          throw new AccessError('INVALID_INPUT');
      }
      if (
        !item.requestedCategoryId &&
        !item.requestedModelId &&
        item.machineIds.length !== item.quantity
      )
        throw new AccessError('INVALID_INPUT');
      for (const id of item.machineIds) {
        if (selected.has(id)) throw new AccessError('INVALID_INPUT');
        selected.add(id);
        const machine = machines.find((m) => m.id === id);
        if (!machine) throw new AccessError('NOT_FOUND');
        this.allowedBranch(c, machine.branchId);
        if (machine.branchId !== branchId || !matches(machine, item))
          throw new AccessError('INVALID_INPUT');
        if (
          machine.lifecycleState !== 'ACTIVE' ||
          (eligible && !serviceAllowsDispatch(machine))
        )
          throw new AccessError('MACHINE_INELIGIBLE');
      }
    }
  }
  private inputItems(row: RentalView): RentalItemInput[] {
    return liveItems(row).map((i) => ({
      requestedCategoryId: i.requestedCategoryId,
      requestedModelId: i.requestedModelId,
      quantity: i.quantity,
      specifications: i.specifications,
      plannedStartAt: i.plannedStartAt,
      plannedEndAt: i.plannedEndAt,
      machineIds: i.assignments
        .filter((a) => !a.releasedAt)
        .map((a) => a.machineId),
      agreedRate: i.agreedRate ?? null,
      rateUnit: i.rateUnit ?? null,
      currency: i.currency ?? null,
      commercialNotes: i.commercialNotes ?? null,
    }));
  }
  private ready(row: RentalView) {
    if (
      !liveItems(row).length ||
      liveItems(row).some(
        (i) =>
          !i.plannedStartAt ||
          !i.plannedEndAt ||
          i.agreedRate == null ||
          !i.rateUnit ||
          !i.currency,
      )
    )
      throw new AccessError('INVALID_INPUT');
  }
  private async schedule(
    r: RentalRepositories,
    c: TenantContext,
    row: RentalView,
  ) {
    if (!row.plannedStartAt || !row.plannedEndAt) return;
    const commitments = await r.rentals.commitments(c);
    assertSchedule(
      commitments,
      await r.rentals.machines(c),
      row.plannedStartAt,
      row.plannedEndAt,
      this.now().getTime(),
    );
  }
  private async states(r: RentalRepositories, c: TenantContext, ids: string[]) {
    const commitments = await r.rentals.commitments(c);
    for (const id of new Set(ids)) {
      const assignments = commitments
        .flatMap(liveAssignments)
        .filter((a) => a.machineId === id && !a.actualEndAt);
      await r.machines.set(
        c,
        id,
        assignments.some((a) => a.actualStartAt)
          ? 'RENTED'
          : assignments.length
            ? 'RESERVED'
            : 'NOT_RENTED',
      );
    }
  }
  list(p: AuthenticatedPrincipal, o: unknown, q: unknown) {
    return this.run(p, o, 'rentals.read', false, async (r, c) => {
      const page = await r.rentals.list(c, parse(rentalSearchSchema, q));
      return { ...page, items: page.items.map((row) => this.visible(c, row)) };
    });
  }
  get(p: AuthenticatedPrincipal, o: unknown, id: unknown) {
    return this.run(p, o, 'rentals.read', false, async (r, c) =>
      this.visible(c, await this.getRow(r, c, id)),
    );
  }
  catalog(p: AuthenticatedPrincipal, o: unknown) {
    return this.run(p, o, 'rentals.read', false, (r, c) =>
      r.rentals.catalog(c),
    );
  }
  create(
    p: AuthenticatedPrincipal,
    o: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.create', true, async (r, c) => {
      const input = parse(rentalCreateSchema, body);
      this.pricing(c, input.items);
      await r.rentals.requireCustomer(c, input.customerId);
      await this.branch(r, c, input.branchId);
      await this.validateItems(r, c, input.branchId, input.items);
      const row = await r.rentals.create(c, input);
      await this.audit(r, c, requestId, row.id, 'RENTAL_CREATED');
      if (input.items.some((i) => i.machineIds.length))
        await this.audit(r, c, requestId, row.id, 'RENTAL_MACHINE_ASSIGNED');
      if (input.items.some((i) => i.agreedRate != null))
        await this.audit(r, c, requestId, row.id, 'RENTAL_TERMS_CHANGED');
      return this.visible(c, row);
    });
  }
  update(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.update', true, async (r, c) => {
      const row = await this.getRow(r, c, id);
      if (!['DRAFT', 'QUOTED'].includes(row.status))
        throw new AccessError('INVALID_TRANSITION');
      const input = parse(rentalPatchSchema, body);
      if (input.items) {
        this.pricing(c, input.items);
        if (
          liveItems(row).some((i) => i.agreedRate != null || i.commercialNotes)
        )
          requirePermission(c, 'rentals.pricing.edit');
      }
      const branch =
        input.branchId === undefined ? row.branchId : input.branchId;
      await this.branch(r, c, branch);
      await r.rentals.requireCustomer(c, input.customerId ?? row.customerId);
      await this.validateItems(
        r,
        c,
        branch,
        input.items ?? this.inputItems(row),
      );
      await r.rentals.edit(c, row.id, input);
      await this.audit(r, c, requestId, row.id, 'RENTAL_UPDATED');
      if (input.customerId && input.customerId !== row.customerId)
        await this.audit(r, c, requestId, row.id, 'RENTAL_CUSTOMER_CHANGED');
      if (branch !== row.branchId)
        await this.audit(r, c, requestId, row.id, 'RENTAL_BRANCH_CHANGED', {
          previousBranchId: row.branchId,
          nextBranchId: branch,
        });
      if (input.items) {
        await this.audit(r, c, requestId, row.id, 'RENTAL_TERMS_CHANGED');
        if (liveAssignments(row).length)
          await this.audit(r, c, requestId, row.id, 'RENTAL_MACHINE_RELEASED');
        if (input.items.some((i) => i.machineIds.length))
          await this.audit(r, c, requestId, row.id, 'RENTAL_MACHINE_ASSIGNED');
      }
      return this.visible(c, await this.getRow(r, c, row.id));
    });
  }
  confirm(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    quote: boolean,
    requestId: string,
  ) {
    return this.run(
      p,
      o,
      quote ? 'rentals.update' : 'rentals.reserve',
      true,
      async (r, c) => {
        const row = await this.getRow(r, c, id),
          target = quote ? 'QUOTED' : 'RESERVED';
        if (row.status === target) return this.visible(c, row);
        if (!['DRAFT', 'QUOTED'].includes(row.status))
          throw new AccessError('INVALID_TRANSITION');
        this.ready(row);
        await r.rentals.requireCustomer(c, row.customerId);
        await this.branch(r, c, row.branchId);
        await this.validateItems(
          r,
          c,
          row.branchId,
          this.inputItems(row),
          !quote,
        );
        await r.rentals.setStatus(c, row.id, target);
        if (!quote) {
          await this.schedule(r, c, await this.getRow(r, c, row.id));
          for (const item of liveItems(row))
            await r.rentals.term(c, item.id, {
              plannedStartAt: item.plannedStartAt!,
              plannedEndAt: item.plannedEndAt!,
              agreedRate: item.agreedRate!,
              rateUnit: item.rateUnit!,
              currency: item.currency!,
            });
          await this.states(
            r,
            c,
            liveAssignments(row).map((a) => a.machineId),
          );
        }
        await this.audit(
          r,
          c,
          requestId,
          row.id,
          quote ? 'RENTAL_QUOTED' : 'RENTAL_RESERVED',
          { previousState: row.status, nextState: target },
        );
        return this.visible(c, await this.getRow(r, c, row.id));
      },
    );
  }
  assign(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.update', true, async (r, c) => {
      const row = await this.getRow(r, c, id);
      if (!['DRAFT', 'QUOTED', 'RESERVED', 'ACTIVE'].includes(row.status))
        throw new AccessError('INVALID_TRANSITION');
      const input = parse(rentalAssignSchema, body),
        item = liveItems(row).find((i) => i.id === input.itemId);
      if (!item) throw new AccessError('NOT_FOUND');
      const current = item.assignments.filter((a) => !a.releasedAt);
      if (current.length + input.machineIds.length > item.quantity)
        throw new AccessError('INVALID_INPUT');
      const next = this.inputItems(row).map((i) => i);
      const index = liveItems(row).findIndex((i) => i.id === item.id);
      const desired = next[index]!;
      desired.machineIds = [
        ...current.map((a) => a.machineId),
        ...input.machineIds,
      ];
      await this.validateItems(r, c, row.branchId, next, true);
      for (const machineId of input.machineIds)
        await r.rentals.assign(c, item.id, machineId);
      await r.rentals.refreshDates(c, row.id);
      const result = await this.getRow(r, c, row.id);
      if (['RESERVED', 'ACTIVE'].includes(row.status)) {
        await this.schedule(r, c, result);
        await this.states(r, c, input.machineIds);
      }
      await this.audit(r, c, requestId, row.id, 'RENTAL_MACHINE_ASSIGNED');
      return this.visible(c, result);
    });
  }
  release(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.update', true, async (r, c) => {
      const row = await this.getRow(r, c, id);
      if (!['DRAFT', 'QUOTED', 'RESERVED', 'ACTIVE'].includes(row.status))
        throw new AccessError('INVALID_TRANSITION');
      const input = parse(rentalReleaseSchema, body),
        a = liveAssignments(row).find((a) => a.id === input.assignmentId);
      if (!a) throw new AccessError('NOT_FOUND');
      if (a.actualStartAt) throw new AccessError('INVALID_TRANSITION');
      const item = liveItems(row).find((i) =>
        i.assignments.some((x) => x.id === a.id),
      )!;
      if (!item.requestedCategoryId && !item.requestedModelId)
        throw new AccessError('INVALID_INPUT');
      await r.rentals.release(c, a.id, input.reason, this.now().toISOString());
      await r.rentals.refreshDates(c, row.id);
      const result = await this.getRow(r, c, row.id);
      if (['RESERVED', 'ACTIVE'].includes(row.status))
        await this.schedule(r, c, result);
      await this.states(r, c, [a.machineId]);
      await this.audit(r, c, requestId, row.id, 'RENTAL_MACHINE_RELEASED');
      return this.visible(c, result);
    });
  }
  dispatch(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.dispatch', true, async (r, c) => {
      const row = await this.getRow(r, c, id);
      if (!['RESERVED', 'ACTIVE'].includes(row.status))
        throw new AccessError('INVALID_TRANSITION');
      const input = parse(rentalDispatchSchema, body);
      if (
        Date.parse(input.actualStartAt) > this.now().getTime() ||
        new Set(input.assignmentIds).size !== input.assignmentIds.length
      )
        throw new AccessError('INVALID_INPUT');
      await r.rentals.requireCustomer(c, row.customerId);
      await this.branch(r, c, row.branchId);
      const machines = await r.rentals.machines(c),
        commitments = await r.rentals.commitments(c);
      const ids: string[] = [];
      for (const id of input.assignmentIds) {
        const a = liveAssignments(row).find((a) => a.id === id);
        if (!a || a.actualEndAt) throw new AccessError('INVALID_TRANSITION');
        if (a.actualStartAt) {
          if (a.actualStartAt !== input.actualStartAt)
            throw new AccessError('INVALID_TRANSITION');
          continue;
        }
        const m = machines.find((m) => m.id === a.machineId);
        if (!m || !serviceAllowsDispatch(m))
          throw new AccessError('MACHINE_INELIGIBLE');
        this.allowedBranch(c, m.branchId);
        if (m.branchId !== row.branchId) throw new AccessError('ACCESS_DENIED');
        if (
          commitments
            .flatMap(liveAssignments)
            .some(
              (other) =>
                other.machineId === m.id &&
                other.id !== a.id &&
                other.actualStartAt &&
                !other.actualEndAt,
            )
        )
          throw new AccessError('RENTAL_CONFLICT');
        if (
          await r.rentals.hasActualConflict(c, m.id, input.actualStartAt, a.id)
        )
          throw new AccessError('RENTAL_CONFLICT');
        await r.rentals.start(c, a.id, input.actualStartAt);
        ids.push(m.id);
      }
      if (!ids.length) return this.visible(c, row);
      await r.rentals.setStatus(c, row.id, 'ACTIVE', {
        actualStartAt:
          row.actualStartAt && row.actualStartAt < input.actualStartAt
            ? row.actualStartAt
            : input.actualStartAt,
      });
      const result = await this.getRow(r, c, row.id);
      const earliest = result.actualStartAt!;
      assertSchedule(
        await r.rentals.commitments(c),
        machines,
        earliest < result.plannedStartAt! ? earliest : result.plannedStartAt!,
        result.plannedEndAt! > input.actualStartAt
          ? result.plannedEndAt!
          : new Date(this.now().getTime() + 1).toISOString(),
        this.now().getTime(),
      );
      await this.states(r, c, ids);
      await this.audit(r, c, requestId, row.id, 'RENTAL_DISPATCHED', {
        previousState: row.status,
        nextState: 'ACTIVE',
      });
      return this.visible(c, result);
    });
  }
  returnMachines(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.return', true, async (r, c) => {
      const row = await this.getRow(r, c, id);
      if (row.status !== 'ACTIVE') throw new AccessError('INVALID_TRANSITION');
      const input = parse(rentalReturnSchema, body);
      if (
        Date.parse(input.actualEndAt) > this.now().getTime() ||
        new Set(input.assignmentIds).size !== input.assignmentIds.length
      )
        throw new AccessError('INVALID_INPUT');
      const ids: string[] = [];
      for (const id of input.assignmentIds) {
        const a = liveAssignments(row).find((a) => a.id === id);
        if (!a?.actualStartAt || input.actualEndAt < a.actualStartAt)
          throw new AccessError('INVALID_INPUT');
        if (a.actualEndAt) {
          if (a.actualEndAt !== input.actualEndAt)
            throw new AccessError('INVALID_TRANSITION');
          continue;
        }
        await r.rentals.end(c, a.id, input.actualEndAt);
        ids.push(a.machineId);
      }
      if (ids.length) {
        await r.rentals.refreshDates(c, row.id);
        await this.states(r, c, ids);
        await this.audit(r, c, requestId, row.id, 'RENTAL_MACHINES_RETURNED');
      }
      return this.visible(c, await this.getRow(r, c, row.id));
    });
  }
  complete(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.return', true, async (r, c) => {
      const row = await this.getRow(r, c, id);
      if (row.status === 'COMPLETED') return this.visible(c, row);
      if (
        row.status !== 'ACTIVE' ||
        liveItems(row).some(
          (i) =>
            i.assignments.filter((a) => !a.releasedAt && a.actualEndAt).length <
            i.quantity,
        ) ||
        liveAssignments(row).some((a) => !a.actualEndAt)
      )
        throw new AccessError('INVALID_TRANSITION');
      const dates = liveAssignments(row)
        .map((a) => a.actualEndAt!)
        .sort();
      await r.rentals.setStatus(c, row.id, 'COMPLETED', {
        actualEndAt: dates.at(-1)!,
      });
      await this.states(
        r,
        c,
        liveAssignments(row).map((a) => a.machineId),
      );
      await this.audit(r, c, requestId, row.id, 'RENTAL_COMPLETED', {
        previousState: row.status,
        nextState: 'COMPLETED',
      });
      return this.visible(c, await this.getRow(r, c, row.id));
    });
  }
  cancel(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.cancel', true, async (r, c) => {
      const row = await this.getRow(r, c, id);
      const input = parse(rentalCancelSchema, body);
      if (row.status === 'CANCELLED') return this.visible(c, row);
      if (!['DRAFT', 'QUOTED', 'RESERVED'].includes(row.status))
        throw new AccessError('INVALID_TRANSITION');
      const time = this.now().toISOString();
      for (const a of liveAssignments(row))
        await r.rentals.release(c, a.id, input.reason, time);
      await r.rentals.setStatus(c, row.id, 'CANCELLED', {
        cancelledAt: time,
        cancellationReason: input.reason,
      });
      await this.states(
        r,
        c,
        liveAssignments(row).map((a) => a.machineId),
      );
      await this.audit(r, c, requestId, row.id, 'RENTAL_CANCELLED', {
        previousState: row.status,
        nextState: 'CANCELLED',
      });
      return this.visible(c, await this.getRow(r, c, row.id));
    });
  }
  extend(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.extend', true, async (r, c) => {
      const row = await this.getRow(r, c, id);
      if (!['RESERVED', 'ACTIVE'].includes(row.status))
        throw new AccessError('INVALID_TRANSITION');
      const input = parse(rentalExtendSchema, body);
      if (new Set(input.items.map((i) => i.itemId)).size !== input.items.length)
        throw new AccessError('INVALID_INPUT');
      for (const change of input.items) {
        const item = liveItems(row).find((i) => i.id === change.itemId);
        if (
          !item ||
          !item.plannedEndAt ||
          change.plannedEndAt <= item.plannedEndAt ||
          item.assignments.filter((a) => !a.releasedAt && a.actualEndAt)
            .length === item.quantity
        )
          throw new AccessError('INVALID_INPUT');
        if (
          change.agreedRate !== undefined ||
          change.rateUnit !== undefined ||
          change.currency !== undefined
        )
          requirePermission(c, 'rentals.pricing.edit');
        const last = item.terms?.at(-1);
        await r.rentals.term(c, item.id, {
          plannedStartAt: item.plannedEndAt,
          plannedEndAt: change.plannedEndAt,
          agreedRate: change.agreedRate ?? last?.agreedRate ?? item.agreedRate!,
          rateUnit: change.rateUnit ?? last?.rateUnit ?? item.rateUnit!,
          currency: change.currency ?? last?.currency ?? item.currency!,
        });
        await r.rentals.extend(c, item.id, change.plannedEndAt);
      }
      await r.rentals.refreshDates(c, row.id);
      const result = await this.getRow(r, c, row.id);
      await this.schedule(r, c, result);
      await this.audit(r, c, requestId, row.id, 'RENTAL_EXTENDED');
      if (
        input.items.some(
          (i) =>
            i.agreedRate !== undefined ||
            i.rateUnit !== undefined ||
            i.currency !== undefined,
        )
      )
        await this.audit(r, c, requestId, row.id, 'RENTAL_TERMS_CHANGED');
      return this.visible(c, result);
    });
  }
  replace(
    p: AuthenticatedPrincipal,
    o: unknown,
    id: unknown,
    body: unknown,
    requestId: string,
  ) {
    return this.run(p, o, 'rentals.dispatch', true, async (r, c) => {
      requirePermission(c, 'rentals.return');
      requirePermission(c, 'rentals.update');
      const row = await this.getRow(r, c, id);
      if (row.status !== 'ACTIVE') throw new AccessError('INVALID_TRANSITION');
      const input = parse(rentalReplaceSchema, body),
        item = liveItems(row).find((i) =>
          i.assignments.some(
            (a) => a.id === input.assignmentId && !a.releasedAt,
          ),
        ),
        old = item?.assignments.find((a) => a.id === input.assignmentId);
      if (
        !item ||
        !old?.actualStartAt ||
        old.actualEndAt ||
        input.actualAt < old.actualStartAt ||
        Date.parse(input.actualAt) > this.now().getTime()
      )
        throw new AccessError('INVALID_INPUT');
      const machines = await r.rentals.machines(c),
        machine = machines.find((m) => m.id === input.machineId);
      if (!machine) throw new AccessError('NOT_FOUND');
      this.allowedBranch(c, machine.branchId);
      if (
        machine.branchId !== row.branchId ||
        !matches(machine, item) ||
        (!item.requestedCategoryId &&
          !item.requestedModelId &&
          machine.modelId !==
            machines.find((m) => m.id === old.machineId)?.modelId)
      )
        throw new AccessError('INVALID_INPUT');
      if (!serviceAllowsDispatch(machine))
        throw new AccessError('MACHINE_INELIGIBLE');
      if (
        liveAssignments(row).some((a) => a.machineId === machine.id) ||
        (await r.rentals.commitments(c))
          .flatMap(liveAssignments)
          .some(
            (a) =>
              a.machineId === machine.id && a.actualStartAt && !a.actualEndAt,
          )
      )
        throw new AccessError('RENTAL_CONFLICT');
      await this.branch(r, c, row.branchId);
      if (await r.rentals.hasActualConflict(c, machine.id, input.actualAt))
        throw new AccessError('RENTAL_CONFLICT');
      await r.rentals.end(c, old.id, input.actualAt);
      await r.rentals.release(c, old.id, input.reason, input.actualAt);
      await r.rentals.assign(c, item.id, machine.id);
      const assigned = liveAssignments(await this.getRow(r, c, row.id)).find(
        (a) => a.machineId === machine.id,
      )!;
      await r.rentals.start(c, assigned.id, input.actualAt);
      await r.rentals.refreshDates(c, row.id);
      const result = await this.getRow(r, c, row.id);
      await this.schedule(r, c, result);
      await this.states(r, c, [old.machineId, machine.id]);
      await this.audit(r, c, requestId, row.id, 'RENTAL_MACHINE_RELEASED');
      await this.audit(r, c, requestId, row.id, 'RENTAL_MACHINE_ASSIGNED');
      await this.audit(r, c, requestId, row.id, 'RENTAL_MACHINES_RETURNED');
      await this.audit(r, c, requestId, row.id, 'RENTAL_DISPATCHED');
      return this.visible(c, result);
    });
  }
  availability(p: AuthenticatedPrincipal, o: unknown, q: unknown) {
    return this.run(p, o, 'rentals.read', false, async (r, c) => {
      const input = parse(rentalAvailabilitySchema, q);
      await this.branch(r, c, input.branchId);
      const machines = await r.rentals.machines(c),
        commitments = await r.rentals.commitments(c);
      let existing: RentalView | undefined;
      if (input.rentalId) {
        existing = await this.getRow(r, c, input.rentalId);
        if (
          existing.branchId !== input.branchId ||
          !liveItems(existing).some(
            (i) =>
              i.id === input.itemId &&
              i.plannedStartAt === input.plannedStartAt &&
              i.plannedEndAt === input.plannedEndAt,
          )
        )
          throw new AccessError('INVALID_INPUT');
      }
      const candidates = machines
        .filter(
          (m) =>
            serviceAllowsDispatch(m) &&
            m.branchId === input.branchId &&
            matches(m, {
              requestedCategoryId: null,
              requestedModelId: null,
              specifications:
                input.platformHeightM === undefined
                  ? {}
                  : { platformHeightM: input.platformHeightM },
            }) &&
            (!input.requestedCategoryId ||
              m.categoryId === input.requestedCategoryId) &&
            (!input.requestedModelId || m.modelId === input.requestedModelId) &&
            `${m.fleetNumber} ${m.manufacturer} ${m.model}`
              .toLowerCase()
              .includes(input.q.toLowerCase()),
        )
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        );
      const after = input.cursor
        ? candidates.filter((m) => `${m.createdAt}|${m.id}` < input.cursor!)
        : candidates;
      const available: RentalMachine[] = [];
      for (const m of after) {
        const hypothetical: RentalView = existing
          ? structuredClone(existing)
          : {
              id: 'availability',
              organizationId: c.organizationId,
              number: '',
              customerId: '',
              customerName: '',
              branchId: input.branchId,
              branchName: null,
              timezone: 'UTC',
              status: 'RESERVED',
              notes: null,
              plannedStartAt: input.plannedStartAt,
              plannedEndAt: input.plannedEndAt,
              actualStartAt: null,
              actualEndAt: null,
              cancelledAt: null,
              cancellationReason: null,
              createdAt: '',
              updatedAt: '',
              items: [],
            };
        hypothetical.status =
          existing?.status === 'ACTIVE' ? 'ACTIVE' : 'RESERVED';
        let item = existing
          ? hypothetical.items.find((i) => i.id === input.itemId)
          : undefined;
        if (item) {
          if (
            item.assignments.filter((a) => !a.releasedAt).length >=
              item.quantity ||
            !matches(m, item)
          )
            continue;
        } else {
          item = {
            id: 'availability',
            requestedCategoryId: null,
            requestedModelId: null,
            quantity: 1,
            specifications: {},
            plannedStartAt: input.plannedStartAt,
            plannedEndAt: input.plannedEndAt,
            removedAt: null,
            assignments: [],
          };
          hypothetical.items.push(item);
        }
        item.assignments.push({
          id: 'availability',
          machineId: m.id,
          fleetNumber: m.fleetNumber,
          manufacturer: m.manufacturer,
          model: m.model,
          assignedAt: this.now().toISOString(),
          releasedAt: null,
          actualStartAt: null,
          actualEndAt: null,
          reason: null,
        });
        try {
          assertSchedule(
            [
              ...commitments.filter((row) => row.id !== hypothetical.id),
              hypothetical,
            ],
            machines,
            input.plannedStartAt,
            input.plannedEndAt,
            this.now().getTime(),
          );
          available.push(m);
        } catch (e) {
          if (!(e instanceof AccessError) || e.code !== 'RENTAL_CONFLICT')
            throw e;
        }
        if (available.length > input.limit) break;
      }
      const items = available.slice(0, input.limit),
        last = items.at(-1);
      return {
        items: items.map((m) => ({
          id: m.id,
          fleetNumber: m.fleetNumber,
          manufacturer: m.manufacturer,
          model: m.model,
          category: m.category,
          branchId: m.branchId,
          serviceState: m.serviceState,
        })),
        nextCursor:
          available.length > input.limit && last
            ? `${last.createdAt}|${last.id}`
            : null,
      };
    });
  }
}
