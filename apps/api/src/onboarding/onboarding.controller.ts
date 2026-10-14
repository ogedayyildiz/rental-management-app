import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  Header,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Public,
  RequirePermission,
  RequirePlatformPermission,
  requestAccess,
} from '../access/access.http.js';
import { OnboardingService } from './onboarding.service.js';

@Controller()
export class OnboardingController {
  constructor(
    @Inject(OnboardingService) private readonly service: OnboardingService,
  ) {}
  @Post('platform/organizations')
  @RequirePlatformPermission('platform.organization.create')
  @Header('Cache-Control', 'no-store')
  create(@Req() request: object, @Body() body: unknown) {
    const { principal, requestId } = requestAccess(request);
    return this.service.createOrganization(principal, body, requestId);
  }
  @Post('organizations/:organizationId/invitations')
  @RequirePermission('users.manage')
  @Header('Cache-Control', 'no-store')
  invite(
    @Req() request: object,
    @Param('organizationId') organizationId: string,
    @Body() body: unknown,
  ) {
    const { principal, requestId } = requestAccess(request);
    return this.service.invite(principal, organizationId, body, requestId);
  }
  @Post('organizations/:organizationId/invitations/:invitationId/revoke')
  @RequirePermission('users.manage')
  revoke(
    @Req() request: object,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ) {
    const { principal, requestId } = requestAccess(request);
    return this.service.revoke(
      principal,
      organizationId,
      invitationId,
      requestId,
    );
  }
  // This route verifies Auth0 credentials itself: an invitee may not have a User yet.
  @Post(
    'platform/organizations/:organizationId/invitations/:invitationId/revoke',
  )
  @RequirePlatformPermission('platform.organization.create')
  revokeInitial(
    @Req() request: object,
    @Param('organizationId') organizationId: string,
    @Param('invitationId') invitationId: string,
  ) {
    const { principal, requestId } = requestAccess(request);
    return this.service.revokeInitial(
      principal,
      organizationId,
      invitationId,
      requestId,
    );
  }

  // Unlike ordinary routes, the invitee may not have an application User yet.
  @Post('invitations/accept')
  @Public()
  @Header('Cache-Control', 'no-store')
  accept(
    @Headers('authorization') authorization: unknown,
    @Body() body: unknown,
  ) {
    return this.service.accept(authorization, body, randomUUID());
  }
}
