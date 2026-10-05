"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ButtonLink } from "@/components/form";
import { RentalTable } from "@/components/rental-table";
import { ErrorMessage, Loading } from "@/components/ui";
import { api, type ContractStatus, type RentalListItem } from "@/lib/api";
import { CONTRACT_STATUS_LABEL } from "@/lib/format";

const TABS: (ContractStatus | "all")[] = ["draft", "reserved", "active", "completed", "cancelled", "all"];

export default function RentalsPage() {
  const { data, error } = useQuery({ queryKey: ["rentals"], queryFn: () => api<RentalListItem[]>("/rentals") });
  const [tab, setTab] = useState<ContractStatus | "all">("active");
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <Loading />;

  const count = (s: ContractStatus | "all") => (s === "all" ? data.length : data.filter((r) => r.status === s).length);
  const rows = tab === "all" ? data : data.filter((r) => r.status === tab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Offers & rentals</h1>
        <ButtonLink href="/rentals/new">+ New offer</ButtonLink>
      </div>
      <div className="flex gap-1 overflow-x-auto rounded-md border border-border bg-surface p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1 whitespace-nowrap ${tab === t ? "bg-foreground/10 font-medium" : "text-muted"}`}
          >
            {t === "all" ? "All" : t === "draft" ? "Offers" : CONTRACT_STATUS_LABEL[t]}{" "}
            <span className="text-xs text-muted">{count(t)}</span>
          </button>
        ))}
      </div>
      <RentalTable rentals={rows} />
    </div>
  );
}
