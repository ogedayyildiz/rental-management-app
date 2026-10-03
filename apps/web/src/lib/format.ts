import type { MachineStatus } from "@rental/shared";

export const STATUS_LABEL: Record<MachineStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  rented: "Rented",
  maintenance: "Maintenance",
  out_of_service: "Out of service",
  retired: "Retired",
};

/** Hex colors, shared by badges and map markers */
export const STATUS_COLOR: Record<MachineStatus, string> = {
  available: "#16a34a",
  reserved: "#9333ea",
  rented: "#2563eb",
  maintenance: "#d97706",
  out_of_service: "#dc2626",
  retired: "#6b7280",
};

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
export const formatMoney = (v: number | string) => money.format(Number(v));

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Same threshold the API uses for "online" */
export const isOnline = (lastSeenAt: string | null) =>
  !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 5 * 60_000;
