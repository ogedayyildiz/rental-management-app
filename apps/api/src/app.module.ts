import { Controller, Get, Module } from '@nestjs/common';
import { Public } from './access/access.http.js';
import { FoundationModule } from './foundation.module.js';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  operationalMiddleware,
  ReadinessController,
  ExportCapacityInterceptor,
} from './operations.http.js';

@Controller('health')
class HealthController {
  @Get()
  @Public()
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'api' };
  }
}

@Module({
  imports: [FoundationModule],
  controllers: [HealthController, ReadinessController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ExportCapacityInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(operationalMiddleware).forRoutes('*');
  }
}
