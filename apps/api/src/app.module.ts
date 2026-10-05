import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { LiveGateway } from './live/live.gateway.js';
import { MachinesModule } from './machines/machines.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { RentalsModule } from './rentals/rentals.module.js';
import { TenantMiddleware } from './tenant/tenant.js';

@Module({
  imports: [
    DbModule,
    MachinesModule,
    MaintenanceModule,
    DashboardModule,
    CatalogModule,
    CustomersModule,
    RentalsModule,
  ],
  controllers: [HealthController],
  providers: [LiveGateway],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).exclude('health').forRoutes('*');
  }
}
