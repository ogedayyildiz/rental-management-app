import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  Inject,
  Header,
} from '@nestjs/common';
import { Authenticated, requestAccess } from '../access/access.http.js';
import { FinanceOperationsService } from './finance.service.js';

// The global guard authenticates; kind-specific financial permissions are checked
// again inside the transaction against the persisted record, never the route body.
@Controller('organizations/:organizationId/finance/records')
@Authenticated()
export class FinanceOperationsController {
  constructor(
    @Inject(FinanceOperationsService)
    private readonly service: FinanceOperationsService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Query() q: unknown,
  ) {
    return this.service.list(requestAccess(r).principal, o, q);
  }
  @Get('branches') branches(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Query() q: unknown,
  ) {
    return this.service.branches(requestAccess(r).principal, o, q);
  }
  @Get('balances') @Header('Cache-Control', 'no-store') balances(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Query() q: unknown,
  ) {
    return this.service.balances(requestAccess(r).principal, o, q);
  }
  @Get(':id') @Header('Cache-Control', 'no-store') get(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
  ) {
    return this.service.get(requestAccess(r).principal, o, id);
  }
  @Post() create(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.create(a.principal, o, b, a.requestId);
  }
  @Patch(':id') update(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.update(a.principal, o, id, b, a.requestId);
  }
  @Post(':id/confirm') confirm(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.confirm(a.principal, o, id, b, a.requestId);
  }
  @Post(':id/cancel') cancel(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.cancel(a.principal, o, id, b, a.requestId);
  }
  @Patch(':id/document') document(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.document(a.principal, o, id, b, a.requestId);
  }
  @Post(':id/payments') pay(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.pay(a.principal, o, id, b, a.requestId);
  }
  @Post(':id/payments/:paymentId/reverse') reverse(
    @Req() r: object,
    @Param('organizationId') o: string,
    @Param('id') id: string,
    @Param('paymentId') p: string,
    @Body() b: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.reverse(a.principal, o, id, p, b, a.requestId);
  }
}
