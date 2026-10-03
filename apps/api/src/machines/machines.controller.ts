import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { createMachineSchema, type CreateMachineInput } from '@rental/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { OrgId } from '../tenant/tenant.js';
import { MachinesService } from './machines.service.js';

const telemetryQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(10_000).default(2000),
});

@Controller('machines')
export class MachinesController {
  constructor(private readonly machines: MachinesService) {}

  @Get()
  list(@OrgId() orgId: string) {
    return this.machines.list(orgId);
  }

  @Post()
  create(@OrgId() orgId: string, @Body(new ZodPipe(createMachineSchema)) body: CreateMachineInput) {
    return this.machines.create(orgId, body);
  }

  @Get(':id')
  get(@OrgId() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.machines.get(orgId, id);
  }

  /** Raw readings, newest `limit` within [from, to]; defaults to the last 24 h. */
  @Get(':id/telemetry')
  telemetry(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(telemetryQuery)) query: z.infer<typeof telemetryQuery>,
  ) {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - 86_400_000);
    return this.machines.telemetry(orgId, id, from, to, query.limit);
  }

  @Get(':id/errors')
  errors(@OrgId() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.machines.errors(orgId, id);
  }
}
