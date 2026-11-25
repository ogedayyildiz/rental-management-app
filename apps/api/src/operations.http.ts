import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Controller,
  Get,
  Inject,
  Injectable,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { defer, finalize } from 'rxjs';
import { assertDeploymentDatabase } from '@rental/database';
import type { PrismaClient } from '@rental/database';
import { deploymentEnvironment, hardenedDeployment } from '@rental/config';
import { Public } from './access/access.http.js';
import { DATABASE } from './database.token.js';
import { requestId } from './request-context.js';

@Injectable()
export class ExportCapacityInterceptor implements NestInterceptor {
  private active = 0;
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    if (
      !/^\/organizations\/[0-9a-f-]+\/(?:finance\/export|maintenance\/machines\/[0-9a-f-]+\/export\/)/.test(
        request.url ?? '',
      )
    )
      return next.handle();
    const response = context.switchToHttp().getResponse<ServerResponse>();
    return defer(() => {
      if (this.active >= 4) {
        response.setHeader('retry-after', '5');
        throw new HttpException('HTTP_429', 429);
      }
      this.active++;
      let closed = response.destroyed,
        finished = false,
        released = false;
      const release = () => {
        if (closed && finished && !released) {
          released = true;
          this.active--;
        }
      };
      // A client disconnect must not release capacity while its report is still generating.
      response.once('close', () => {
        closed = true;
        release();
      });
      return defer(() => next.handle()).pipe(
        finalize(() => {
          finished = true;
          release();
        }),
      );
    });
  }
}
export function operationalMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
): void {
  const id = requestId(request);
  response.setHeader('x-request-id', id);
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('cache-control', 'no-store');
  const start = performance.now();
  const origin = request.headers.origin;
  if (origin && origin !== process.env['APP_BASE_URL']?.replace(/\/$/, '')) {
    response.writeHead(403, { 'content-type': 'application/json' });
    response.end('{"code":"ACCESS_DENIED"}');
    return;
  }
  response.once('close', () => {
    // Deliberately no URL, query, body, headers, identifiers or exception messages.
    if (process.env['NODE_ENV'] !== 'test')
      console.info(
        JSON.stringify({
          event: 'http_request',
          service: 'api',
          requestId: id,
          method: request.method,
          route: (request as IncomingMessage & { route?: { path?: string } })
            .route?.path,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - start),
        }),
      );
  });
  next();
}

export async function databaseReady(db: PrismaClient): Promise<void> {
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
      await tx.$queryRaw`SELECT 1`;
      if (hardenedDeployment(process.env))
        await assertDeploymentDatabase(
          tx,
          deploymentEnvironment(process.env),
          process.env['DEPLOYMENT_ID']!,
        );
    },
    { maxWait: 3000, timeout: 4500 },
  );
}

@Controller('ready')
export class ReadinessController {
  constructor(@Inject(DATABASE) private readonly db: PrismaClient) {}
  @Get()
  @Public()
  async ready() {
    try {
      await databaseReady(this.db);
      return { status: 'ready', service: 'api' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
