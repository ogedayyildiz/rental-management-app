import { Controller, Get, Module } from '@nestjs/common';
import { Public } from './access/access.http.js';
import { FoundationModule } from './foundation.module.js';

@Controller('health')
class HealthController {
  @Get()
  @Public()
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'api' };
  }
}

@Module({ imports: [FoundationModule], controllers: [HealthController] })
export class AppModule {}
