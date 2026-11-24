import {
  analyticsQuerySchema,
  analyticsReportSchema,
  analyticsTelemetrySchema,
} from '@rental/validation';
import {
  AccessService,
  requirePermission,
  type AuthenticatedPrincipal,
} from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type { FinanceUnitOfWork, FinanceVisibility } from './contracts.js';
import { calculateReport } from './calculation.js';
import { reportingPeriod } from './period.js';
export class AnalyticsService {
  constructor(
    private readonly uow: FinanceUnitOfWork,
    private readonly now: () => Date = () => new Date(),
    private readonly telemetry?: (
      p: AuthenticatedPrincipal,
      o: string,
      id: string,
    ) => Promise<unknown>,
  ) {}
  report(
    principal: AuthenticatedPrincipal,
    org: unknown,
    query: unknown,
    exporting = false,
  ) {
    const parsed = analyticsQuerySchema.safeParse(query);
    if (!parsed.success) throw new AccessError('INVALID_INPUT');
    const q = parsed.data;
    return this.uow.read(async ({ access, finance }) => {
      const c = await new AccessService(access).tenant(principal, org);
      requirePermission(c, 'finance.analytics.view');
      requirePermission(c, 'machines.read');
      if (exporting) requirePermission(c, 'finance.analytics.export');
      const has = (p: string) => c.permissions.includes(p);
      if (
        (q.group === 'customer' || q.customerId) &&
        (!has('customers.read') || !has('rentals.read'))
      )
        throw new AccessError('ACCESS_DENIED');
      const customerScope = q.group === 'customer' || !!q.customerId;
      const v: FinanceVisibility = {
        transportCosts:
          has('rentals.read') && has('rentals.transport_costs.view'),
        acquisition: has('finance.acquisition_cost.view') && !customerScope,
        pricing: has('rentals.read') && has('rentals.pricing.view'),
        costs:
          has('maintenance.read') &&
          has('maintenance.costs.view') &&
          !customerScope,
        rentals: has('rentals.read'),
        maintenance: has('maintenance.read'),
        customers: has('customers.read'),
        export: has('finance.analytics.export'),
      };
      const timezone = await finance.timezone(c),
        now = this.now(),
        period = reportingPeriod(q, now, timezone);
      if (q.sort === 'COMPLETED_VALUE' && !v.pricing)
        throw new AccessError('ACCESS_DENIED');
      if (['UTILIZATION', 'UNRENTED_TIME'].includes(q.sort) && !v.rentals)
        throw new AccessError('ACCESS_DENIED');
      const report = analyticsReportSchema.parse(
        calculateReport(
          await finance.snapshot(c, q, v),
          q,
          v,
          period,
          now,
          timezone,
          c.branchScope === 'ALL_BRANCHES',
        ),
      );
      if (q.machineId && has('telemetry.read') && this.telemetry) {
        const current = analyticsTelemetrySchema.safeParse(
          await this.telemetry(principal, c.organizationId, q.machineId),
        );
        const hours = current.success
          ? current.data.signals.find((s) => s.signal === 'operatingHours')
          : undefined;
        const row = report.items.find((r) => r.id === q.machineId);
        if (
          row &&
          hours &&
          typeof hours.value === 'number' &&
          Number.isFinite(hours.value)
        )
          row.operatingHours = {
            value: hours.value,
            recordedAt: hours.recorded.toISOString(),
            stale: hours.stale,
          };
      }
      return report;
    });
  }
}
