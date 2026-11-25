import { StreamableFile } from '@nestjs/common';
import { maintenanceReport } from '../infrastructure/maintenance-report.js';
import { AccessError } from '../access/contracts.js';
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Header,
  Inject,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { RequirePermission, requestAccess } from '../access/access.http.js';
import { MaintenanceService } from './maintenance.service.js';
@Controller('organizations/:organizationId/maintenance')
export class MaintenanceController {
  constructor(
    @Inject(MaintenanceService) private readonly service: MaintenanceService,
  ) {}
  @Get()
  @RequirePermission('maintenance.read')
  @Header('Cache-Control', 'no-store')
  list(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Query() q: unknown,
  ) {
    return this.service.list(requestAccess(r).principal, o, q);
  }
  @Get('plans')
  @RequirePermission('maintenance.read')
  @Header('Cache-Control', 'no-store')
  plans(@Req() r: object, @Param('organizationId') o: string) {
    return this.service.plans(requestAccess(r).principal, o);
  }
  @Post('plans')
  @RequirePermission('maintenance.plans.manage')
  plan(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.savePlan(a.principal, o, null, b, a.requestId);
  }
  @Patch('plans/:id')
  @RequirePermission('maintenance.plans.manage')
  editPlan(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.savePlan(a.principal, o, id, b, a.requestId);
  }
  @Get(':id')
  @RequirePermission('maintenance.read')
  @Header('Cache-Control', 'no-store')
  get(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
  ) {
    return this.service.get(requestAccess(r).principal, o, id);
  }
  @Post()
  @RequirePermission('maintenance.create')
  create(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.create(a.principal, o, b, a.requestId);
  }
  @Patch(':id')
  @RequirePermission('maintenance.update')
  update(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.update(a.principal, o, id, b, a.requestId);
  }
  @Post(':id/open')
  @RequirePermission('maintenance.schedule')
  open(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.transition(a.principal, o, id, 'open', b, a.requestId);
  }
  @Post(':id/schedule')
  @RequirePermission('maintenance.schedule')
  schedule(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.transition(
      a.principal,
      o,
      id,
      'schedule',
      b,
      a.requestId,
    );
  }
  @Post(':id/start')
  @RequirePermission('maintenance.start')
  start(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.transition(a.principal, o, id, 'start', b, a.requestId);
  }
  @Post(':id/complete')
  @RequirePermission('maintenance.complete')
  complete(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.transition(
      a.principal,
      o,
      id,
      'complete',
      b,
      a.requestId,
    );
  }
  @Post(':id/cancel')
  @RequirePermission('maintenance.cancel')
  cancel(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.transition(
      a.principal,
      o,
      id,
      'cancel',
      b,
      a.requestId,
    );
  }
  @Post(':id/materials')
  @RequirePermission('maintenance.update')
  material(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.mutateChild(
      a.principal,
      o,
      id,
      'material',
      b,
      a.requestId,
    );
  }
  @Post(':id/costs')
  @RequirePermission('maintenance.costs.edit')
  cost(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.mutateChild(a.principal, o, id, 'cost', b, a.requestId);
  }
  @Patch(':id/tasks/:taskId')
  @RequirePermission('maintenance.update')
  task(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.mutateChild(
      a.principal,
      o,
      id,
      'task',
      b,
      a.requestId,
      taskId,
    );
  }
  @Post('machines/:machineId/blocks')
  @RequirePermission('maintenance.block_machine')
  block(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('machineId') machineId: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.block(a.principal, o, machineId, b, a.requestId);
  }
  @Post('machines/:machineId/blocks/:id/release')
  @RequirePermission('maintenance.release_machine')
  release(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('machineId') machineId: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.release(a.principal, o, machineId, id, b, a.requestId);
  }
  @Get('machines/:machineId/plans')
  @RequirePermission('maintenance.read')
  @Header('Cache-Control', 'no-store')
  schedules(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('machineId') id: string,
  ) {
    return this.service.schedules(requestAccess(r).principal, o, id);
  }
  @Get('machines/:machineId/blocks')
  @RequirePermission('maintenance.read')
  @Header('Cache-Control', 'no-store')
  restrictions(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('machineId') id: string,
  ) {
    return this.service.restrictions(requestAccess(r).principal, o, id);
  }
  @Post('machine-plans')
  @RequirePermission('maintenance.plans.manage')
  saveSchedule(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.saveSchedule(a.principal, o, b, a.requestId);
  }
  @Get('machines/:machineId/export/:format')
  @RequirePermission('maintenance.export')
  @Header('Cache-Control', 'no-store')
  async report(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('machineId') id: string,
    @Param('format') format: string,
    @Query('locale') locale: string = 'en',
  ) {
    if (locale !== 'en' && locale !== 'tr')
      throw new AccessError('INVALID_INPUT');
    if (format !== 'pdf' && format !== 'xlsx')
      throw new AccessError('INVALID_INPUT');
    const a = requestAccess(r);
    const data = await this.service.report(a.principal, o, id, a.requestId);
    return new StreamableFile(await maintenanceReport(data, format, locale), {
      type:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition:
        'attachment; filename="maintenance-' +
        data.machine.id +
        '.' +
        format +
        '"',
    });
  }
}
