import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Req,
  Query,
  Inject,
  Header,
} from '@nestjs/common';
import { RequirePermission, requestAccess } from '../access/access.http.js';
import { DeviceService } from './device.service.js';
@Controller('organizations/:organizationId')
export class DeviceController {
  constructor(@Inject(DeviceService) private service: DeviceService) {}
  @Get('devices')
  @RequirePermission('device.read')
  @Header('Cache-Control', 'no-store')
  list(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Query('cursor') cursor?: string,
  ) {
    const a = requestAccess(r);
    return this.service.list(a, o, cursor);
  }
  @Get('devices/:id')
  @RequirePermission('device.read')
  @Header('Cache-Control', 'no-store')
  get(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
  ) {
    const a = requestAccess(r);
    return this.service.detail(a, o, id);
  }
  @Post('devices')
  @RequirePermission('device.manage')
  @Header('Cache-Control', 'no-store')
  register(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.save(a, o, null, b);
  }
  @Patch('devices/:id')
  @RequirePermission('device.manage')
  @Header('Cache-Control', 'no-store')
  update(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.save(a, o, id, b);
  }
  @Post('devices/:id/install')
  @RequirePermission('device.assign')
  @Header('Cache-Control', 'no-store')
  install(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.transition(a, o, id, 'install', b);
  }
  @Post('devices/:id/remove')
  @RequirePermission('device.remove')
  @Header('Cache-Control', 'no-store')
  remove(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.transition(a, o, id, 'remove', b);
  }
  @Post('devices/:id/move')
  @RequirePermission('device.assign')
  @Header('Cache-Control', 'no-store')
  move(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.transition(a, o, id, 'move', b);
  }
  @Get('machines/:id/telemetry')
  @RequirePermission('telemetry.read')
  @Header('Cache-Control', 'no-store')
  current(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
  ) {
    const a = requestAccess(r);
    return this.service.machine(a, o, id);
  }
  @Get('machines/:id/telemetry/history')
  @RequirePermission('telemetry.read')
  @Header('Cache-Control', 'no-store')
  history(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Query() q: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.machine(a, o, id, q);
  }
}
