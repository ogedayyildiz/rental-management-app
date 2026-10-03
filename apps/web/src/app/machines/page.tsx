"use client";

import { MACHINE_STATUSES, type MachineStatus } from "@rental/shared";
import Link from "next/link";
import { useState } from "react";
import { Battery, ErrorCodes, ErrorMessage, Loading, StatusBadge } from "@/components/ui";
import { STATUS_LABEL, isOnline, timeAgo } from "@/lib/format";
import { useLiveMachines } from "@/lib/live";

export default function MachinesPage() {
  const { data, error } = useLiveMachines();
  const [status, setStatus] = useState<MachineStatus | "all">("all");
  const [search, setSearch] = useState("");

  if (error) return <ErrorMessage error={error} />;
  if (!data) return <Loading />;

  const q = search.trim().toLowerCase();
  const rows = data.filter(
    (m) =>
      (status === "all" || m.status === status) &&
      (!q || `${m.name} ${m.serialNo} ${m.manufacturer} ${m.model}`.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Machines</h1>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, serial, model…"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as MachineStatus | "all")}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          >
            <option value="all">All statuses</option>
            {MACHINE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Machine</th>
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Battery</th>
              <th className="px-3 py-2 text-right font-medium">Engine h</th>
              <th className="px-3 py-2 font-medium">Errors</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-foreground/5">
                <td className="px-3 py-2">
                  <Link href={`/machines/${m.id}`} className="font-medium hover:underline">
                    {m.name}
                  </Link>
                  <div className="text-xs text-muted">{m.serialNo}</div>
                </td>
                <td className="px-3 py-2">
                  {m.manufacturer} {m.model}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={m.status} />
                </td>
                <td className="px-3 py-2">
                  <Battery soc={m.batterySoc} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{m.engineHours?.toFixed(1) ?? "—"}</td>
                <td className="px-3 py-2">
                  <ErrorCodes codes={m.activeErrorCodes} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={isOnline(m.lastSeenAt) ? "" : "text-muted"}>{timeAgo(m.lastSeenAt)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-muted">No machines match.</p>}
      </div>
    </div>
  );
}
