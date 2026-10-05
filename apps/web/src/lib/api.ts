import type { MachineListItem, MachineStatus, TelemetryHistoryPoint } from "@rental/shared";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res, path));
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Uses the API's own message ("This serial number already exists", validation issues…). */
async function errorMessage(res: Response, path: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[]; issues?: { path: string; message: string }[] };
    if (body.issues?.length) return body.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
    if (Array.isArray(body.message)) return body.message.join("; ");
    if (body.message) return body.message;
  } catch {
    // not JSON
  }
  return `${res.status} ${res.statusText} for ${path}`;
}

export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });

/** JSON dates arrive as strings */
export type Json<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };

export type Machine = Json<MachineListItem>;
export type TelemetryPoint = Json<TelemetryHistoryPoint>;

export interface MachineDetail extends Machine {
  modelId: string;
  homeDepotId: string | null;
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

export interface MachineModel {
  id: string;
  manufacturer: string;
  model: string;
  category: string;
  dailyRate: string | null;
  weeklyRate: string | null;
  monthlyRate: string | null;
  machineCount: number;
}

export interface Depot {
  id: string;
  name: string;
}

export interface Customer {
  id: string;
  companyName: string;
  taxNo: string | null;
  address?: string | null;
  notes?: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  activeRentals?: number;
  openOffers?: number;
  outstanding?: string;
}

export type ContractStatus = "draft" | "reserved" | "active" | "completed" | "cancelled";
export type RateType = "hourly" | "daily" | "weekly" | "monthly";

export interface RentalListItem {
  id: string;
  contractNo: string;
  status: ContractStatus;
  startDate: string;
  plannedEndDate: string | null;
  actualEndDate: string | null;
  totalAmount: string | null;
  customerId: string;
  customerName: string;
  machines: string | null;
  paid: string;
}

export interface RentalLine {
  id: string;
  machineId: string;
  machineName: string;
  serialNo: string;
  manufacturer: string;
  model: string;
  rateType: RateType;
  rate: string;
  deliveryFee: string;
  amount: string | null;
  startEngineHours: number | null;
  endEngineHours: number | null;
  cancelledAt: string | null;
}

export interface Payment {
  id: string;
  amount: string;
  dueDate: string | null;
  receivedAt: string | null;
  method: string | null;
  reference: string | null;
  status: "expected" | "received" | "overdue" | "written_off";
}

export interface RentalDetail {
  id: string;
  contractNo: string;
  status: ContractStatus;
  startDate: string;
  plannedEndDate: string | null;
  actualEndDate: string | null;
  siteAddress: string | null;
  terms: string | null;
  totalAmount: string | null;
  createdAt: string;
  customer: {
    id: string;
    companyName: string;
    taxNo: string | null;
    address: string | null;
    contacts: { name?: string; phone?: string; email?: string }[];
  };
  items: RentalLine[];
  payments: Payment[];
}

export interface MachineAvailability {
  id: string;
  name: string;
  serialNo: string;
  status: string;
  manufacturer: string;
  model: string;
  category: string;
  dailyRate: string | null;
  weeklyRate: string | null;
  monthlyRate: string | null;
  available: boolean;
  conflict: { contractNo: string; startDate: string; endDate: string } | null;
}
