import { describe, expect, it } from 'vitest';
import { offerInputSchema, rentalDays, rentalLineAmount, rentalUnits } from './rentals.js';

describe('rental pricing', () => {
  it('counts both the first and last day', () => {
    expect(rentalDays('2026-10-01', '2026-10-01')).toBe(1);
    expect(rentalDays('2026-10-01', '2026-10-10')).toBe(10);
  });

  it('rounds partial weeks and months up', () => {
    expect(rentalUnits('weekly', 7)).toBe(1);
    expect(rentalUnits('weekly', 8)).toBe(2);
    expect(rentalUnits('monthly', 31)).toBe(2);
    expect(rentalUnits('hourly', 2)).toBe(16);
  });

  it('adds the delivery fee once', () => {
    expect(rentalLineAmount({ rateType: 'daily', rate: 1500, deliveryFee: 750 }, 10)).toBe(15_750);
  });
});

describe('offerInputSchema', () => {
  const line = { machineId: '00000000-0000-4000-8000-000000000002', rateType: 'daily' as const, rate: 100 };
  const base = { customerId: '00000000-0000-4000-8000-000000000001', startDate: '2026-10-01', endDate: '2026-10-05', items: [line] };

  it('accepts a valid offer and defaults the delivery fee', () => {
    expect(offerInputSchema.parse(base).items[0]!.deliveryFee).toBe(0);
  });

  it('rejects an end date before the start date', () => {
    expect(offerInputSchema.safeParse({ ...base, endDate: '2026-09-30' }).success).toBe(false);
  });

  it('rejects the same machine twice', () => {
    expect(offerInputSchema.safeParse({ ...base, items: [line, line] }).success).toBe(false);
  });
});
