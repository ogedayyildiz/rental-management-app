import { Inject, Injectable } from '@nestjs/common';
import { withTenant, type Database } from '@rental/db';
import { maintenanceDue, type MaintenanceDue } from '@rental/shared';
import { sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';

interface PlanRow extends Record<string, unknown> {
  plan_id: string;
  plan_name: string;
  machine_id: string;
  machine_name: string;
  interval_hours: number | null;
  interval_days: number | null;
  warn_before_hours: number;
  warn_before_days: number;
  last_hours: number;
  last_date: string;
  current_hours: number | null;
}

export interface MaintenancePlanStatus extends MaintenanceDue {
  planId: string;
  planName: string;
  machineId: string;
  machineName: string;
  lastHours: number;
  lastDate: string;
  currentHours: number | null;
}

@Injectable()
export class MaintenanceService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Every active plan with its due status, most urgent first. */
  async planStatuses(orgId: string, machineId?: string): Promise<MaintenancePlanStatus[]> {
    const rows = await withTenant(this.db, orgId, (tx) =>
      tx.execute<PlanRow>(sql`
        with last_service as (
          select distinct on (plan_id) plan_id, performed_at, engine_hours
          from maintenance_records
          where plan_id is not null
          order by plan_id, performed_at desc
        )
        select
          p.id as plan_id, p.name as plan_name,
          m.id as machine_id, m.name as machine_name,
          p.interval_hours, p.interval_days, p.warn_before_hours, p.warn_before_days,
          coalesce(l.engine_hours, p.baseline_hours) as last_hours,
          coalesce(l.performed_at::date, p.baseline_date)::text as last_date,
          s.engine_hours as current_hours
        from maintenance_plans p
        join machines m on m.id = p.machine_id
        left join last_service l on l.plan_id = p.id
        left join machine_state s on s.machine_id = p.machine_id
        where p.active and m.status <> 'retired'
          ${machineId ? sql`and p.machine_id = ${machineId}` : sql``}
      `),
    );

    const now = new Date();
    const rank = { overdue: 0, due_soon: 1, ok: 2 } as const;
    return rows
      .map((r) => ({
        planId: r.plan_id,
        planName: r.plan_name,
        machineId: r.machine_id,
        machineName: r.machine_name,
        lastHours: r.last_hours,
        lastDate: r.last_date,
        currentHours: r.current_hours,
        ...maintenanceDue(
          {
            intervalHours: r.interval_hours,
            intervalDays: r.interval_days,
            warnBeforeHours: r.warn_before_hours,
            warnBeforeDays: r.warn_before_days,
            lastHours: r.last_hours,
            lastDate: new Date(r.last_date),
            currentHours: r.current_hours,
          },
          now,
        ),
      }))
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          (a.hoursRemaining ?? Infinity) - (b.hoursRemaining ?? Infinity),
      );
  }
}
