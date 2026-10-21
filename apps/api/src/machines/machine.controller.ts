import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { RequirePermission, requestAccess } from '../access/access.http.js';
import { MachineService } from './machine.service.js';

@Controller('organizations/:organizationId/machines')
export class MachineController {
  constructor(
    @Inject(MachineService) private readonly service: MachineService,
  ) {}
  @Get()
  @RequirePermission('machines.read')
  @Header('Cache-Control', 'no-store')
  list(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Query() query: unknown,
  ) {
    return this.service.list(requestAccess(r).principal, org, query);
  }
  @Get('branches')
  @RequirePermission('machines.read')
  @Header('Cache-Control', 'no-store')
  branches(@Req() r: object, @Param('organizationId') org: string) {
    return this.service.branches(requestAccess(r).principal, org);
  }
  @Get(':machineId')
  @RequirePermission('machines.read')
  @Header('Cache-Control', 'no-store')
  get(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('machineId') id: string,
  ) {
    return this.service.get(requestAccess(r).principal, org, id);
  }
  @Post()
  @RequirePermission('machines.create')
  @Header('Cache-Control', 'no-store')
  create(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.create(a.principal, org, body, a.requestId);
  }
  @Patch(':machineId')
  @RequirePermission('machines.update')
  @Header('Cache-Control', 'no-store')
  update(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('machineId') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.update(a.principal, org, id, body, a.requestId);
  }
  @Post(':machineId/restore')
  @RequirePermission('machines.archive')
  @Header('Cache-Control', 'no-store')
  restore(
    @Body() body: unknown,
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('machineId') id: string,
  ) {
    const a = requestAccess(r);
    return this.service.restore(a.principal, org, id, body, a.requestId);
  }
  @Post(':machineId/archive')
  @RequirePermission('machines.archive')
  @Header('Cache-Control', 'no-store')
  archive(
    @Body() body: unknown,
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('machineId') id: string,
  ) {
    const a = requestAccess(r);
    return this.service.archive(a.principal, org, id, body ?? {}, a.requestId);
  }
}
