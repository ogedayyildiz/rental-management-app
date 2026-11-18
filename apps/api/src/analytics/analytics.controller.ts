import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { RequirePermission, requestAccess } from '../access/access.http.js';
import { AnalyticsService } from './analytics.service.js';
import { analyticsExport } from '../infrastructure/analytics-export.js';
import { analyticsQuerySchema } from '@rental/validation';
@Controller('organizations/:organizationId/finance')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly service: AnalyticsService,
  ) {}
  @Get()
  @RequirePermission('finance.analytics.view')
  @Header('Cache-Control', 'no-store')
  report(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Query() q: unknown,
  ) {
    return this.service.report(requestAccess(r).principal, org, q);
  }
  @Get('export')
  @RequirePermission('finance.analytics.export')
  @Header('Cache-Control', 'no-store')
  async export(
    @Req() r: object,
    @Param('organizationId') org: string,
    @Query() q: unknown,
  ) {
    const report = await this.service.report(
      requestAccess(r).principal,
      org,
      q,
      true,
    );
    return new StreamableFile(
      await analyticsExport(report, analyticsQuerySchema.parse(q).locale),
      {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        disposition: 'attachment; filename="finance-estimates.xlsx"',
      },
    );
  }
}
