import { Controller, Get, Inject } from '@nestjs/common';
import { withTenant, type Database } from '@rental/db';
import { sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { OrgId } from '../tenant/tenant.js';

/** A machine counts as online if it reported within this window. */
const ONLINE_WINDOW = sql`interval '5 minutes'`;

@Controller('dashboard')
export class DashboardController {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly maintenance: MaintenanceService,
  ) {}

  @Get('summary')
  async summary(@OrgId() orgId: string) {
    const [fleet, errors, money] = await withTenant(this.db, orgId, async (tx) => [
      await tx.execute<{ status: string; count: number }>(sql`
        select status, count(*)::int as count from machines group by status`),
      await tx.execute<{ severity: string | null; count: number }>(sql`
        select severity, count(*)::int as count from error_events
        where cleared_at is null group by severity`),
      await tx.execute<{
        online: number;
        outstanding: string;
        overdue: string;
        collected_30d: string;
      }>(sql`
        select
          (select count(*)::int from machine_state where last_seen_at > now() - ${ONLINE_WINDOW}) as online,
          coalesce(sum(amount) filter (where status in ('expected', 'overdue')), 0) as outstanding,
          coalesce(sum(amount) filter (
            where status = 'overdue' or (status = 'expected' and due_date < current_date)), 0) as overdue,
          coalesce(sum(amount) filter (
            where status = 'received' and received_at > now() - interval '30 days'), 0) as collected_30d
        from payments`),
    ]);

    const plans = await this.maintenance.planStatuses(orgId);
    const byStatus = Object.fromEntries(fleet.map((r) => [r.status, r.count]));
    const total = fleet.reduce((sum, r) => sum + r.count, 0);

    return {
      fleet: {
        total,
        byStatus,
        online: money[0]?.online ?? 0,
        utilizationPct: total ? Math.round(((byStatus.rented ?? 0) / total) * 100) : 0,
      },
      activeErrors: Object.fromEntries(errors.map((r) => [r.severity ?? 'unknown', r.count])),
      maintenance: {
        overdue: plans.filter((p) => p.status === 'overdue').length,
        dueSoon: plans.filter((p) => p.status === 'due_soon').length,
      },
      payments: {
        outstanding: Number(money[0]?.outstanding ?? 0),
        overdue: Number(money[0]?.overdue ?? 0),
        collected30d: Number(money[0]?.collected_30d ?? 0),
      },
    };
  }
}
