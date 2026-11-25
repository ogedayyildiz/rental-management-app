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
import { RentalService } from './rental.service.js';
@Controller('organizations/:organizationId/rentals')
export class RentalController {
  constructor(@Inject(RentalService) private readonly service: RentalService) {}
  @Get()
  @RequirePermission('rentals.read')
  @Header('Cache-Control', 'no-store')
  list(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Query() q: unknown,
  ) {
    return this.service.list(requestAccess(r).principal, org, q);
  }
  @Get('catalog')
  @RequirePermission('rentals.read')
  @Header('Cache-Control', 'no-store')
  catalog(@Req() r: object, @Param('organizationId') org: string) {
    return this.service.catalog(requestAccess(r).principal, org);
  }
  @Get('availability')
  @RequirePermission('rentals.read')
  @Header('Cache-Control', 'no-store')
  availability(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Query() q: unknown,
  ) {
    return this.service.availability(requestAccess(r).principal, org, q);
  }
  @Get(':id')
  @RequirePermission('rentals.read')
  @Header('Cache-Control', 'no-store')
  get(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
  ) {
    return this.service.get(requestAccess(r).principal, org, id);
  }
  @Post()
  @RequirePermission('rentals.create')
  @Header('Cache-Control', 'no-store')
  create(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.create(a.principal, org, body, a.requestId);
  }
  @Patch(':id')
  @RequirePermission('rentals.update')
  @Header('Cache-Control', 'no-store')
  update(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.update(a.principal, org, id, body, a.requestId);
  }
  @Post(':id/replace')
  @RequirePermission('rentals.dispatch')
  @Header('Cache-Control', 'no-store')
  replace(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.replace(a.principal, org, id, body, a.requestId);
  }
  @Post(':id/assign')
  @RequirePermission('rentals.update')
  @Header('Cache-Control', 'no-store')
  assign(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.assign(a.principal, org, id, body, a.requestId);
  }
  @Post(':id/release')
  @RequirePermission('rentals.update')
  @Header('Cache-Control', 'no-store')
  release(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.release(a.principal, org, id, body, a.requestId);
  }
  @Post(':id/dispatch')
  @RequirePermission('rentals.dispatch')
  @Header('Cache-Control', 'no-store')
  dispatch(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.dispatch(a.principal, org, id, body, a.requestId);
  }
  @Post(':id/return')
  @RequirePermission('rentals.return')
  @Header('Cache-Control', 'no-store')
  returnMachines(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.returnMachines(a.principal, org, id, body, a.requestId);
  }
  @Post(':id/extend')
  @RequirePermission('rentals.extend')
  @Header('Cache-Control', 'no-store')
  extend(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.extend(a.principal, org, id, body, a.requestId);
  }
  @Post(':id/cancel')
  @RequirePermission('rentals.cancel')
  @Header('Cache-Control', 'no-store')
  cancel(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.cancel(a.principal, org, id, body, a.requestId);
  }
  @Post(':id/quote')
  @RequirePermission('rentals.update')
  @Header('Cache-Control', 'no-store')
  quote(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
  ) {
    const a = requestAccess(r);
    return this.service.confirm(a.principal, org, id, true, a.requestId);
  }
  @Post(':id/reserve')
  @RequirePermission('rentals.reserve')
  @Header('Cache-Control', 'no-store')
  reserve(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
  ) {
    const a = requestAccess(r);
    return this.service.confirm(a.principal, org, id, false, a.requestId);
  }
  @Post(':id/complete')
  @RequirePermission('rentals.return')
  @Header('Cache-Control', 'no-store')
  complete(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
  ) {
    const a = requestAccess(r);
    return this.service.complete(a.principal, org, id, a.requestId);
  }
}
