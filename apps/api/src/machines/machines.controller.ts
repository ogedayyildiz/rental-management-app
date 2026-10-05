import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createMachineSchema,
  updateMachineSchema,
  type CreateMachineInput,
  type UpdateMachineInput,
} from '@rental/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { OrgId } from '../tenant/tenant.js';
import { MachinesService } from './machines.service.js';

const availabilityQuery = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    excludeContractId: z.string().uuid().optional(),
  })
  .refine((q) => q.to >= q.from, { message: '"to" is before "from"' });

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

  /** Which machines can be booked for a period; used by the offer form. */
  @Get('availability')
  availability(
    @OrgId() orgId: string,
    @Query(new ZodPipe(availabilityQuery)) q: z.infer<typeof availabilityQuery>,
  ) {
    return this.machines.availability(orgId, q.from, q.to, q.excludeContractId);
  }

  @Get(':id')
  get(@OrgId() orgId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.machines.get(orgId, id);
  }

  @Patch(':id')
  update(
    @OrgId() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateMachineSchema)) body: UpdateMachineInput,
  ) {
    return this.machines.update(orgId, id, body);
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
