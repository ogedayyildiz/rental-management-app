import { randomUUID } from 'node:crypto';
import {
  Catch,
  HttpException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import type {
  ArgumentsHost,
  CanActivate,
  ExceptionFilter,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TenantPermission, PlatformPermission } from '@rental/permissions';
import { AccessError } from './contracts.js';
import {
  AuthenticationService,
  AccessService,
  requirePermission,
} from './access.service.js';
import type { AuthenticatedPrincipal } from './access.service.js';

const PUBLIC = Symbol('public-route');
const PERMISSION = Symbol('tenant-permission');
const PLATFORM = Symbol('platform-permission');
const AUTHENTICATED = Symbol('authenticated');
export const Authenticated = () => SetMetadata(AUTHENTICATED, true);
export const RequirePlatformPermission = (permission: PlatformPermission) =>
  SetMetadata(PLATFORM, permission);
export const Public = () => SetMetadata(PUBLIC, true);
export const RequirePermission = (permission: TenantPermission) =>
  SetMetadata(PERMISSION, permission);
interface Request {
  headers: { authorization?: string };
  params: { organizationId?: string };
}
const requests = new WeakMap<
  object,
  { principal: AuthenticatedPrincipal; requestId: string }
>();
export function requestAccess(request: object): {
  principal: AuthenticatedPrincipal;
  requestId: string;
} {
  const access = requests.get(request);
  if (!access) throw new AccessError('UNAUTHENTICATED');
  return access;
}

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthenticationService)
    private readonly authentication: AuthenticationService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC, [
        execution.getHandler(),
        execution.getClass(),
      ])
    )
      return true;
    const request = execution.switchToHttp().getRequest<Request>();
    const principal = await this.authentication.authenticate(
      request.headers.authorization,
    );
    const targets = [execution.getHandler(), execution.getClass()];
    const platform = this.reflector.getAllAndOverride<PlatformPermission>(
      PLATFORM,
      targets,
    );
    if (platform) {
      await this.access.requirePlatform(principal, platform);
      requests.set(request, { principal, requestId: randomUUID() });
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED, targets)) {
      requests.set(request, { principal, requestId: randomUUID() });
      return true;
    }
    const permission = this.reflector.getAllAndOverride<TenantPermission>(
      PERMISSION,
      [execution.getHandler(), execution.getClass()],
    );
    // Protected routes must declare their policy; omission must not grant access.
    if (!permission) throw new AccessError('ACCESS_DENIED');
    const context = await this.access.tenant(
      principal,
      request.params.organizationId,
    );
    requirePermission(context, permission);
    requests.set(request, { principal, requestId: randomUUID() });
    return true;
  }
}

@Catch()
export class SafeErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    let status = 500;
    let code = 'INTERNAL_ERROR';
    if (exception instanceof AccessError) {
      code = exception.code;
      status = {
        UNAUTHENTICATED: 401,
        ACCESS_DENIED: 403,
        NOT_FOUND: 404,
        INVALID_INPUT: 400,
      }[exception.code];
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = `HTTP_${status}`;
    }
    const response = host
      .switchToHttp()
      .getResponse<{ status(code: number): { json(body: unknown): void } }>();
    response.status(status).json({ code });
  }
}
