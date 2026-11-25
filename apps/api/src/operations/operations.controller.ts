import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { Authenticated, requestAccess } from '../access/access.http.js';
import { OperationsService } from './operations.service.js';
@Controller('organizations/:organizationId/operations')
@Authenticated()
export class OperationsController {
  constructor(
    @Inject(OperationsService) private readonly service: OperationsService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  dashboard(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Query() q: unknown,
  ) {
    return this.service.dashboard(requestAccess(r).principal, org, q);
  }
  @Get('search')
  @Header('Cache-Control', 'no-store')
  search(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Query() q: unknown,
  ) {
    return this.service.search(requestAccess(r).principal, org, q);
  }
  @Patch('preferences')
  preferences(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Body() body: unknown,
  ) {
    return this.service.savePreferences(requestAccess(r).principal, org, body);
  }
  @Patch('notifications/:key')
  interact(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    return this.service.interact(requestAccess(r).principal, org, key, body);
  }
}
