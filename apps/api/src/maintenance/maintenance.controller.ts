import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { OrgId } from '../tenant/tenant.js';
import { MaintenanceService } from './maintenance.service.js';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  /** ?status=overdue|due_soon|ok to filter; ?machineId= for one machine */
  @Get('plans')
  async plans(
    @OrgId() orgId: string,
    @Query('status') status?: string,
    @Query('machineId', new ParseUUIDPipe({ optional: true })) machineId?: string,
  ) {
    const plans = await this.maintenance.planStatuses(orgId, machineId);
    return status ? plans.filter((p) => p.status === status) : plans;
  }
}
