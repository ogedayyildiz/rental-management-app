import { Controller, Get, Header, Inject, Req } from '@nestjs/common';
import { Authenticated, requestAccess } from './access.http.js';
import { CurrentUserService } from './current-user.service.js';

@Controller('me')
export class CurrentUserController {
  constructor(
    @Inject(CurrentUserService) private readonly service: CurrentUserService,
  ) {}
  @Get()
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  current(@Req() request: object) {
    return this.service.current(requestAccess(request).principal);
  }
}
