"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import { MachineMap } from "@/components/machine-map";
import { Battery, Card, ErrorCodes, ErrorMessage, Kpi, Loading, StatusBadge } from "@/components/ui";
import { api, type ErrorEvent, type MachineDetail, type MaintenancePlan, type TelemetryPoint } from "@/lib/api";
import { formatMoney, timeAgo } from "@/lib/format";
import { useLiveMachines } from "@/lib/live";

export function MachineDetailView({ id }: { id: string }) {
  const detail = useQuery({ queryKey: ["machine", id], queryFn: () => api<MachineDetail>(`/machines/${id}`) });
  const telemetry = useQuery({
    queryKey: ["machine", id, "telemetry"],
    queryFn: () => api<TelemetryPoint[]>(`/machines/${id}/telemetry?limit=2000`),
    refetchInterval: 60_000,
  });
  const errors = useQuery({ queryKey: ["machine", id, "errors"], queryFn: () => api<ErrorEvent[]>(`/machines/${id}/errors`) });
  const plans = useQuery({
    queryKey: ["maintenance", id],
    queryFn: () => api<MaintenancePlan[]>(`/maintenance/plans?machineId=${id}`),
  });
  // Live position/battery come from the shared live feed
  const live = useLiveMachines().data?.find((m) => m.id === id);

  if (detail.error) return <ErrorMessage error={detail.error} />;
  if (!detail.data) return <Loading />;
  const m = { ...detail.data, ...live };

  const revenue = Number(m.stats.revenueEarned);
  const maintenanceCost = Number(m.stats.maintenanceCost);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/machines" className="text-sm text-muted hover:underline">
          ← Machines
        </Link>
        <h1 className="text-xl font-semibold">{m.name}</h1>
        <StatusBadge status={m.status} />
        <span className="text-sm text-muted">
          {m.manufacturer} {m.model} · {m.serialNo}
          {m.device && ` · GPS ${m.device.externalId}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Battery" value={<Battery soc={m.batterySoc} />} hint={`last seen ${timeAgo(m.lastSeenAt)}`} />
        <Kpi label="Engine hours" value={m.engineHours?.toFixed(1) ?? "—"} hint={m.ignition ? "Ignition on" : "Ignition off"} />
        <Kpi label="Revenue earned" value={formatMoney(revenue)} hint={`maintenance ${formatMoney(maintenanceCost)}`} />
        <Kpi
          label="Errors"
          value={m.stats.errors30d}
          hint={`last 30 days · ${m.stats.errors365d} in 12 months`}
          tone={m.stats.errors30d > 3 ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <MachineMap machines={live ? [live] : []} className="h-80" />
          <Card title="Battery, last 24 h">
            <SocChart points={telemetry.data ?? []} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Current rental">
            {m.currentRental ? (
              <div className="text-sm">
                <div className="font-medium">{m.currentRental.contractNo}</div>
                <div className="text-muted">
                  since {new Date(m.currentRental.startAt).toLocaleDateString()}
                  {m.currentRental.plannedEndDate && ` · until ${m.currentRental.plannedEndDate}`}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">Not on rent.</p>
            )}
          </Card>

          <Card title="Active errors">
            <ErrorCodes codes={m.activeErrorCodes} />
          </Card>

          <Card title="Maintenance">
            <ul className="space-y-2 text-sm">
              {plans.data?.map((p) => (
                <li key={p.planId} className="flex justify-between gap-2">
                  <span>{p.planName}</span>
                  <span
                    className={
                      p.status === "overdue" ? "text-red-600" : p.status === "due_soon" ? "text-amber-600" : "text-muted"
                    }
                  >
                    {p.hoursRemaining != null
                      ? `${Math.round(p.hoursRemaining)} h left`
                      : p.daysRemaining != null
                        ? `${p.daysRemaining} days left`
                        : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Error history">
            <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {errors.data?.length ? (
                errors.data.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span>
                      <span className="font-mono">{e.code}</span>{" "}
                      <span className="text-muted">{e.description ?? ""}</span>
                    </span>
                    <span className="text-xs whitespace-nowrap text-muted">{timeAgo(e.startedAt)}</span>
                  </li>
                ))
              ) : (
                <li className="text-muted">No errors recorded.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Minimal SVG line chart; to be replaced by ECharts when reporting grows. */
function SocChart({ points }: { points: TelemetryPoint[] }) {
  const path = useMemo(() => {
    const data = points.filter((p) => p.batterySoc != null);
    if (data.length < 2) return null;
    const t0 = new Date(data[0]!.time).getTime();
    const t1 = new Date(data[data.length - 1]!.time).getTime();
    return data
      .map((p, i) => {
        const x = ((new Date(p.time).getTime() - t0) / Math.max(t1 - t0, 1)) * 600;
        const y = 150 - (p.batterySoc! / 100) * 150;
        return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [points]);

  if (!path) return <p className="text-sm text-muted">Not enough data yet.</p>;
  return (
    <svg viewBox="0 0 600 150" className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Battery state of charge">
      {[25, 50, 75].map((v) => (
        <line key={v} x1="0" x2="600" y1={150 - v * 1.5} y2={150 - v * 1.5} stroke="currentColor" strokeOpacity="0.1" />
      ))}
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
