import { Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { depots, machineModels, machines, withTenant, type Database } from '@rental/db';
import { machineModelInputSchema, type MachineModelInput } from '@rental/shared';
import { asc, count, eq } from 'drizzle-orm';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB } from '../db/db.module.js';
import { OrgId } from '../tenant/tenant.js';

const money = (v: number | undefined) => (v === undefined ? undefined : v.toString());

/** Reference data: machine models (with price list) and depots. */
@Controller()
export class CatalogController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get('machine-models')
  listModels(@OrgId() orgId: string) {
    return withTenant(this.db, orgId, (tx) =>
      tx
        .select({
          id: machineModels.id,
          manufacturer: machineModels.manufacturer,
          model: machineModels.model,
          category: machineModels.category,
          dailyRate: machineModels.dailyRate,
          weeklyRate: machineModels.weeklyRate,
          monthlyRate: machineModels.monthlyRate,
          machineCount: count(machines.id),
        })
        .from(machineModels)
        .leftJoin(machines, eq(machines.modelId, machineModels.id))
        .groupBy(machineModels.id)
        .orderBy(asc(machineModels.manufacturer), asc(machineModels.model)),
    );
  }

  @Post('machine-models')
  createModel(@OrgId() orgId: string, @Body(new ZodPipe(machineModelInputSchema)) body: MachineModelInput) {
    return withTenant(this.db, orgId, async (tx) => {
      const [model] = await tx
        .insert(machineModels)
        .values({
          ...body,
          organizationId: orgId,
          dailyRate: money(body.dailyRate),
          weeklyRate: money(body.weeklyRate),
          monthlyRate: money(body.monthlyRate),
        })
        .returning();
      return model;
    });
  }

  @Patch('machine-models/:id')
  updateModel(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(machineModelInputSchema.partial())) body: Partial<MachineModelInput>,
  ) {
    return withTenant(this.db, orgId, async (tx) => {
      const [model] = await tx
        .update(machineModels)
        .set({
          ...body,
          dailyRate: money(body.dailyRate),
          weeklyRate: money(body.weeklyRate),
          monthlyRate: money(body.monthlyRate),
        })
        .where(eq(machineModels.id, id))
        .returning();
      if (!model) throw new NotFoundException('Model not found');
      return model;
    });
  }

  @Get('depots')
  listDepots(@OrgId() orgId: string) {
    return withTenant(this.db, orgId, (tx) =>
      tx.select({ id: depots.id, name: depots.name, address: depots.address }).from(depots).orderBy(asc(depots.name)),
    );
  }
}
