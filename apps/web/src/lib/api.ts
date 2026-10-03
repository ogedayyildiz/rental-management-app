import type { MachineListItem, MachineStatus, TelemetryHistoryPoint } from "@rental/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json() as Promise<T>;
}

/** JSON dates arrive as strings */
export type Json<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };

export type Machine = Json<MachineListItem>;
export type TelemetryPoint = Json<TelemetryHistoryPoint>;

export interface MachineDetail extends Machine {
  year: number | null;
  purchaseDate: string | null;
  purchasePrice: string | null;
  notes: string | null;
  speedKmh: number | null;
  heading: number | null;
  device: { provider: string; externalId: string } | null;
  currentRental: {
    contractId: string;
    contractNo: string;
    startAt: string;
    plannedEndDate: string | null;
  } | null;
  stats: { revenueEarned: string; maintenanceCost: string; errors30d: number; errors365d: number };
}

export interface ErrorEvent {
  id: string;
  code: string;
  severity: "info" | "warning" | "critical" | null;
  description: string | null;
  startedAt: string;
  clearedAt: string | null;
}

export interface MaintenancePlan {
  planId: string;
  planName: string;
  machineId: string;
  machineName: string;
  status: "ok" | "due_soon" | "overdue";
  lastHours: number;
  lastDate: string;
  currentHours: number | null;
  dueAtHours: number | null;
  dueDate: string | null;
  hoursRemaining: number | null;
  daysRemaining: number | null;
}

export interface DashboardSummary {
  fleet: { total: number; byStatus: Partial<Record<MachineStatus, number>>; online: number; utilizationPct: number };
  activeErrors: Partial<Record<"info" | "warning" | "critical" | "unknown", number>>;
  maintenance: { overdue: number; dueSoon: number };
  payments: { outstanding: number; overdue: number; collected30d: number };
}
