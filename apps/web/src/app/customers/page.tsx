"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ButtonLink } from "@/components/form";
import { ErrorMessage, Loading } from "@/components/ui";
import { api, type Customer } from "@/lib/api";
import { formatMoney } from "@/lib/format";

export default function CustomersPage() {
  const { data, error } = useQuery({ queryKey: ["customers"], queryFn: () => api<Customer[]>("/customers") });
  const [search, setSearch] = useState("");
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <Loading />;

  const q = search.trim().toLocaleLowerCase("tr");
  const rows = data.filter(
    (c) => !q || `${c.companyName} ${c.contactName ?? ""} ${c.taxNo ?? ""}`.toLocaleLowerCase("tr").includes(q),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Customers</h1>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/customers/new">+ Add customer</ButtonLink>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers…"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 text-right font-medium">Open offers</th>
              <th className="px-3 py-2 text-right font-medium">Active rentals</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-foreground/5">
                <td className="px-3 py-2">
                  <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                    {c.companyName}
                  </Link>
                  {c.taxNo && <div className="text-xs text-muted">Tax no {c.taxNo}</div>}
                </td>
                <td className="px-3 py-2">
                  {c.contactName ?? "—"}
                  {c.phone && <div className="text-xs text-muted">{c.phone}</div>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.openOffers || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.activeRentals || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Number(c.outstanding) > 0 ? formatMoney(c.outstanding!) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-muted">No customers yet.</p>}
      </div>
    </div>
  );
}
