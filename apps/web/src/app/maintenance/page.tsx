"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ErrorMessage, Loading } from "@/components/ui";
import { api, type MaintenancePlan } from "@/lib/api";

const FILTERS = [
  { value: "attention", label: "Needs attention" },
  { value: "all", label: "All plans" },
] as const;

export default function MaintenancePage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("attention");
  const { data, error } = useQuery({
    queryKey: ["maintenance", "all"],
    queryFn: () => api<MaintenancePlan[]>("/maintenance/plans"),
  });
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <Loading />;
  const rows = filter === "all" ? data : data.filter((p) => p.status !== "ok");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Maintenance</h1>
        <div className="flex gap-1 rounded-md border border-border bg-surface p-1 text-sm">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded px-2 py-1 ${filter === f.value ? "bg-foreground/10 font-medium" : "text-muted"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Machine</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Hours left</th>
              <th className="px-3 py-2 text-right font-medium">Days left</th>
              <th className="px-3 py-2 font-medium">Last service</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p) => (
              <tr key={p.planId}>
                <td className="px-3 py-2">
                  <Link href={`/machines/${p.machineId}`} className="font-medium hover:underline">
                    {p.machineName}
                  </Link>
                </td>
                <td className="px-3 py-2">{p.planName}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      p.status === "overdue" ? "text-red-600" : p.status === "due_soon" ? "text-amber-600" : "text-green-600"
                    }
                  >
                    {p.status === "overdue" ? "Overdue" : p.status === "due_soon" ? "Due soon" : "OK"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {p.hoursRemaining != null ? Math.round(p.hoursRemaining) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{p.daysRemaining ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted">
                  {p.lastDate} · {Math.round(p.lastHours)} h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-muted">Nothing needs attention.</p>}
      </div>
    </div>
  );
}
