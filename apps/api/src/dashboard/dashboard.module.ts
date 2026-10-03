import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { DashboardController } from './dashboard.controller.js';

@Module({
  imports: [MaintenanceModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
