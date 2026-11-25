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
import { CustomerService } from './customer.service.js';

@Controller('organizations/:organizationId/customers')
export class CustomerController {
  constructor(
    @Inject(CustomerService) private readonly service: CustomerService,
  ) {}
  @Get()
  @RequirePermission('customers.read')
  @Header('Cache-Control', 'no-store')
  list(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Query() query: unknown,
  ) {
    return this.service.list(requestAccess(r).principal, org, query);
  }
  @Get(':customerId')
  @RequirePermission('customers.read')
  @Header('Cache-Control', 'no-store')
  get(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('customerId') id: string,
  ) {
    return this.service.get(requestAccess(r).principal, org, id);
  }
  @Post()
  @RequirePermission('customers.create')
  @Header('Cache-Control', 'no-store')
  create(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.create(a.principal, org, body, a.requestId);
  }
  @Patch(':customerId')
  @RequirePermission('customers.update')
  @Header('Cache-Control', 'no-store')
  update(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('customerId') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.update(a.principal, org, id, body, a.requestId);
  }
  @Post(':customerId/archive')
  @RequirePermission('customers.archive')
  @Header('Cache-Control', 'no-store')
  archive(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('customerId') id: string,
  ) {
    const a = requestAccess(r);
    return this.service.archive(a.principal, org, id, a.requestId);
  }
  @Get(':customerId/contacts')
  @RequirePermission('customers.read')
  @Header('Cache-Control', 'no-store')
  contacts(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('customerId') id: string,
  ) {
    return this.service.contacts(requestAccess(r).principal, org, id);
  }
  @Post(':customerId/contacts')
  @RequirePermission('customers.update')
  @Header('Cache-Control', 'no-store')
  addContact(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('customerId') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.saveContact(
      a.principal,
      org,
      id,
      null,
      body,
      a.requestId,
    );
  }
  @Patch(':customerId/contacts/:contactId')
  @RequirePermission('customers.update')
  @Header('Cache-Control', 'no-store')
  editContact(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('customerId') id: string,
    @Param('contactId') child: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.saveContact(
      a.principal,
      org,
      id,
      child,
      body,
      a.requestId,
    );
  }
  @Get(':customerId/addresses')
  @RequirePermission('customers.read')
  @Header('Cache-Control', 'no-store')
  addresses(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('customerId') id: string,
  ) {
    return this.service.addresses(requestAccess(r).principal, org, id);
  }
  @Post(':customerId/addresses')
  @RequirePermission('customers.update')
  @Header('Cache-Control', 'no-store')
  addAddress(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('customerId') id: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.saveAddress(
      a.principal,
      org,
      id,
      null,
      body,
      a.requestId,
    );
  }
  @Patch(':customerId/addresses/:addressId')
  @RequirePermission('customers.update')
  @Header('Cache-Control', 'no-store')
  editAddress(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('customerId') id: string,
    @Param('addressId') child: string,
    @Body() body: unknown,
  ) {
    const a = requestAccess(r);
    return this.service.saveAddress(
      a.principal,
      org,
      id,
      child,
      body,
      a.requestId,
    );
  }
}
