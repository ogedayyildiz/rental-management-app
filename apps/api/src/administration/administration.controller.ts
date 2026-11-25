import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  Req,
  Inject,
  Header,
} from '@nestjs/common';
import { RequirePermission, requestAccess } from '../access/access.http.js';
import { AdministrationService } from './administration.service.js';
@Controller('organizations/:organizationId')
export class AdministrationController {
  constructor(
    @Inject(AdministrationService)
    private readonly service: AdministrationService,
  ) {}
  @Get('settings')
  @RequirePermission('organization.manage')
  @Header('Cache-Control', 'no-store')
  organization(@Req() request: object, @Param('organizationId') org: string) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.organization(principal, org);
  }
  @Patch('settings')
  @RequirePermission('organization.manage')
  @Header('Cache-Control', 'no-store')
  updateOrganization(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Body() body: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.updateOrganization(principal, org, body, requestId);
  }
  @Get('permissions')
  @RequirePermission('roles.manage')
  @Header('Cache-Control', 'no-store')
  permissions(@Req() request: object, @Param('organizationId') org: string) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.permissions(principal, org);
  }
  @Get('roles')
  @RequirePermission('roles.manage')
  @Header('Cache-Control', 'no-store')
  roles(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Query() query: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.roles(principal, org, query);
  }
  @Post('roles')
  @RequirePermission('roles.manage')
  @Header('Cache-Control', 'no-store')
  createRole(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Body() body: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.createRole(principal, org, body, requestId);
  }
  @Patch('roles/:id')
  @RequirePermission('roles.manage')
  @Header('Cache-Control', 'no-store')
  updateRole(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.updateRole(principal, org, id, body, requestId);
  }
  @Get('memberships')
  @RequirePermission('users.manage')
  @Header('Cache-Control', 'no-store')
  members(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Query() query: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.members(principal, org, query);
  }
  @Get('memberships/:id')
  @RequirePermission('users.manage')
  @Header('Cache-Control', 'no-store')
  member(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.member(principal, org, id);
  }
  @Patch('memberships/:id')
  @RequirePermission('users.manage')
  @Header('Cache-Control', 'no-store')
  updateMember(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.updateMember(principal, org, id, body, requestId);
  }
  @Get('branches')
  @RequirePermission('branches.manage')
  @Header('Cache-Control', 'no-store')
  branches(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Query() query: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.branches(principal, org, query);
  }
  @Post('branches')
  @RequirePermission('branches.manage')
  @Header('Cache-Control', 'no-store')
  createBranch(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Body() body: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.createBranch(principal, org, body, requestId);
  }
  @Get('invitations')
  @RequirePermission('users.manage')
  @Header('Cache-Control', 'no-store')
  invitations(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Query() query: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.invitations(principal, org, query);
  }
  @Get('audit')
  @RequirePermission('audit.read')
  @Header('Cache-Control', 'no-store')
  audit(
    @Req() request: object,
    @Param('organizationId') org: string,
    @Query() query: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    void requestId;
    return this.service.audit(principal, org, query);
  }
}
