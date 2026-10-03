import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';

export type TenantRequest = Request & { organizationId?: string };

const uuid = z.string().uuid();

/**
 * Resolves the organization a request acts for.
 *
 * TODO(auth): replace with the authenticated session's active membership.
 * Until then, development accepts an `x-organization-id` header or falls back
 * to DEV_ORG_ID; production refuses every request.
 */
export function resolveDevOrganization(headerValue: unknown): string | undefined {
  if (config.isProduction) return undefined;
  const candidate = typeof headerValue === 'string' && headerValue ? headerValue : config.devOrgId;
  return uuid.safeParse(candidate).success ? candidate : undefined;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: TenantRequest, _res: Response, next: NextFunction): void {
    const organizationId = resolveDevOrganization(req.headers['x-organization-id']);
    if (!organizationId) throw new UnauthorizedException('No organization context');
    req.organizationId = organizationId;
    next();
  }
}

/** Controller parameter: the current request's organization id. */
export const OrgId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<TenantRequest>();
  if (!req.organizationId) throw new UnauthorizedException('No organization context');
  return req.organizationId;
});
