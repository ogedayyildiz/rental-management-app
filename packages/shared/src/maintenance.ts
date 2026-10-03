export type MaintenanceDueStatus = 'ok' | 'due_soon' | 'overdue';

export interface MaintenancePlanProgress {
  intervalHours: number | null;
  intervalDays: number | null;
  warnBeforeHours: number;
  warnBeforeDays: number;
  /** Hour meter and date of the last service (or the plan baseline) */
  lastHours: number;
  lastDate: Date;
  /** Current hour meter, if the machine has reported any */
  currentHours: number | null;
}

export interface MaintenanceDue {
  status: MaintenanceDueStatus;
  dueAtHours: number | null;
  dueDate: Date | null;
  /** Negative when overdue */
  hoursRemaining: number | null;
  daysRemaining: number | null;
}

const DAY_MS = 86_400_000;

/**
 * A plan is due when either threshold is reached, whichever comes first.
 * The worse of the two statuses wins.
 */
export function maintenanceDue(plan: MaintenancePlanProgress, now: Date = new Date()): MaintenanceDue {
  const dueAtHours = plan.intervalHours != null ? plan.lastHours + plan.intervalHours : null;
  const dueDate =
    plan.intervalDays != null ? new Date(plan.lastDate.getTime() + plan.intervalDays * DAY_MS) : null;

  const hoursRemaining =
    dueAtHours != null && plan.currentHours != null ? dueAtHours - plan.currentHours : null;
  const daysRemaining =
    dueDate != null ? Math.floor((dueDate.getTime() - now.getTime()) / DAY_MS) : null;

  let status: MaintenanceDueStatus = 'ok';
  if ((hoursRemaining != null && hoursRemaining <= 0) || (daysRemaining != null && daysRemaining < 0)) {
    status = 'overdue';
  } else if (
    (hoursRemaining != null && hoursRemaining <= plan.warnBeforeHours) ||
    (daysRemaining != null && daysRemaining <= plan.warnBeforeDays)
  ) {
    status = 'due_soon';
  }
  return { status, dueAtHours, dueDate, hoursRemaining, daysRemaining };
}
