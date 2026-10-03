"use client";

import { MachineMap } from "@/components/machine-map";
import { ErrorMessage, Loading, StatusBadge } from "@/components/ui";
import { isOnline, timeAgo } from "@/lib/format";
import { useLiveMachines } from "@/lib/live";
import Link from "next/link";

export default function MapPage() {
  const { data, error } = useLiveMachines();
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <Loading />;
  const online = data.filter((m) => isOnline(m.lastSeenAt)).length;

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3 md:h-[calc(100vh-3rem)]">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Live map</h1>
        <span className="text-sm text-muted">
          {online} / {data.length} online
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <MachineMap machines={data} className="min-h-80 flex-1" />
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface text-sm lg:max-h-none lg:w-72">
          {data.map((m) => (
            <li key={m.id}>
              <Link href={`/machines/${m.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-foreground/5">
                <span>
                  <span className="font-medium">{m.name}</span>
                  {m.activeErrorCodes.length > 0 && <span className="ml-1 text-red-600">●</span>}
                  <span className="block text-xs text-muted">{timeAgo(m.lastSeenAt)}</span>
                </span>
                <StatusBadge status={m.status} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
