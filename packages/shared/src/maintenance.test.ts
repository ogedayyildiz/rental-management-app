import { describe, expect, it } from 'vitest';
import { maintenanceDue, type MaintenancePlanProgress } from './maintenance.js';

const now = new Date('2026-10-03T00:00:00Z');
const base: MaintenancePlanProgress = {
  intervalHours: 250,
  intervalDays: null,
  warnBeforeHours: 25,
  warnBeforeDays: 0,
  lastHours: 1000,
  lastDate: new Date('2026-06-01T00:00:00Z'),
  currentHours: 1100,
};

describe('maintenanceDue', () => {
  it('is ok well before the hours threshold', () => {
    expect(maintenanceDue(base, now)).toMatchObject({ status: 'ok', dueAtHours: 1250, hoursRemaining: 150 });
  });

  it('warns inside the warning window', () => {
    expect(maintenanceDue({ ...base, currentHours: 1230 }, now).status).toBe('due_soon');
  });

  it('is overdue once the hours are reached', () => {
    expect(maintenanceDue({ ...base, currentHours: 1250 }, now).status).toBe('overdue');
  });

  it('uses whichever of hours and days comes first', () => {
    const plan = { ...base, intervalDays: 90, warnBeforeDays: 14 };
    // 124 days since last service: hours are fine, calendar is overdue
    expect(maintenanceDue(plan, now)).toMatchObject({ status: 'overdue', hoursRemaining: 150 });
  });

  it('handles calendar-only plans with no hour meter yet', () => {
    const plan = { ...base, intervalHours: null, intervalDays: 365, warnBeforeDays: 30, currentHours: null };
    expect(maintenanceDue(plan, now)).toMatchObject({ status: 'ok', dueAtHours: null, daysRemaining: 241 });
  });
});
