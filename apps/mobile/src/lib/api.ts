import type { MachineListItem } from '@rental/shared';

/**
 * On a phone, "localhost" is the phone itself: set EXPO_PUBLIC_API_URL to your
 * computer's LAN address (e.g. http://192.168.1.20:4000) in the repo's .env.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`);
  if (!res.ok) throw new Error(`${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

type Json<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };
export type Machine = Json<MachineListItem>;

export interface MachineDetail extends Machine {
  device: { provider: string; externalId: string } | null;
  currentRental: { contractNo: string; startAt: string; plannedEndDate: string | null } | null;
  stats: { revenueEarned: string; maintenanceCost: string; errors30d: number; errors365d: number };
}

export interface MaintenancePlan {
  planId: string;
  planName: string;
  status: 'ok' | 'due_soon' | 'overdue';
  hoursRemaining: number | null;
  daysRemaining: number | null;
}
