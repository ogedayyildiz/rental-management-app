"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Battery, Card, ErrorCodes, ErrorMessage, Kpi, Loading } from "@/components/ui";
import { api, type DashboardSummary, type MaintenancePlan } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useLiveMachines } from "@/lib/live";

export default function DashboardPage() {
  const summary = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardSummary>("/dashboard/summary"),
    refetchInterval: 30_000,
  });
  const due = useQuery({
    queryKey: ["maintenance", "attention"],
    queryFn: async () =>
      (await api<MaintenancePlan[]>("/maintenance/plans")).filter((p) => p.status !== "ok").slice(0, 8),
  });
  const machines = useLiveMachines();

  if (summary.error) return <ErrorMessage error={summary.error} />;
  if (!summary.data) return <Loading />;
  const s = summary.data;
  const errorTotal = Object.values(s.activeErrors).reduce((a, b) => a + (b ?? 0), 0);
  const withErrors = (machines.data ?? []).filter((m) => m.activeErrorCodes.length > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Fleet" value={s.fleet.total} hint={`${s.fleet.online} online now`} />
        <Kpi
          label="Rented"
          value={`${s.fleet.byStatus.rented ?? 0}`}
          hint={`${s.fleet.utilizationPct}% utilization · ${s.fleet.byStatus.available ?? 0} available`}
        />
        <Kpi
          label="Active errors"
          value={errorTotal}
          hint={`${s.activeErrors.critical ?? 0} critical`}
          tone={s.activeErrors.critical ? "bad" : errorTotal ? "warn" : undefined}
        />
        <Kpi
          label="Maintenance"
          value={s.maintenance.overdue}
          hint={`overdue · ${s.maintenance.dueSoon} due soon`}
          tone={s.maintenance.overdue ? "bad" : s.maintenance.dueSoon ? "warn" : undefined}
        />
        <Kpi label="Payments outstanding" value={formatMoney(s.payments.outstanding)} />
        <Kpi
          label="Payments overdue"
          value={formatMoney(s.payments.overdue)}
          tone={s.payments.overdue ? "bad" : undefined}
        />
        <Kpi label="Collected (30 days)" value={formatMoney(s.payments.collected30d)} />
        <Kpi label="In workshop" value={s.fleet.byStatus.maintenance ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Machines with active errors">
          {withErrors.length === 0 ? (
            <p className="text-sm text-muted">No active errors.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {withErrors.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/machines/${m.id}`} className="font-medium hover:underline">
                    {m.name}
                  </Link>
                  <span className="flex items-center gap-4">
                    <Battery soc={m.batterySoc} />
                    <ErrorCodes codes={m.activeErrorCodes} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Maintenance needing attention">
          {!due.data?.length ? (
            <p className="text-sm text-muted">Nothing due.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {due.data.map((p) => (
                <li key={p.planId} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <Link href={`/machines/${p.machineId}`} className="font-medium hover:underline">
                      {p.machineName}
                    </Link>{" "}
                    <span className="text-muted">· {p.planName}</span>
                  </span>
                  <span className={p.status === "overdue" ? "text-red-600" : "text-amber-600"}>
                    {p.status === "overdue" ? "Overdue" : "Due soon"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
