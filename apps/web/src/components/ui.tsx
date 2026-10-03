import type { MachineStatus } from "@rental/shared";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/format";

export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-surface p-4 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-medium text-muted">{title}</h2>}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "bad" | "warn" }) {
  const color = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: MachineStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ErrorCodes({ codes }: { codes: string[] }) {
  if (codes.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {codes.map((c) => (
        <span key={c} className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-xs text-red-600">
          {c}
        </span>
      ))}
    </span>
  );
}

export function Battery({ soc }: { soc: number | null }) {
  if (soc == null) return <span className="text-muted">—</span>;
  const color = soc < 20 ? "bg-red-500" : soc < 40 ? "bg-amber-500" : "bg-green-500";
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="h-2 w-10 overflow-hidden rounded bg-foreground/10">
        <span className={`block h-full ${color}`} style={{ width: `${soc}%` }} />
      </span>
      {Math.round(soc)}%
    </span>
  );
}

export function Loading() {
  return <div className="p-6 text-sm text-muted">Loading…</div>;
}

export function ErrorMessage({ error }: { error: Error }) {
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">
      Could not load data: {error.message}. Is the API running on port 4000?
    </div>
  );
}
