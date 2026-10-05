import Link from "next/link";
import type { ContractStatus, RentalListItem } from "@/lib/api";
import { CONTRACT_STATUS_COLOR, CONTRACT_STATUS_LABEL, formatDate, formatMoney, todayIso } from "@/lib/format";

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className="size-2 rounded-full" style={{ background: CONTRACT_STATUS_COLOR[status] }} />
      {CONTRACT_STATUS_LABEL[status]}
    </span>
  );
}

export function RentalTable({ rentals, hideCustomer = false }: { rentals: RentalListItem[]; hideCustomer?: boolean }) {
  const today = todayIso();
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">No.</th>
            {!hideCustomer && <th className="px-3 py-2 font-medium">Customer</th>}
            <th className="px-3 py-2 font-medium">Machines</th>
            <th className="px-3 py-2 font-medium">Period</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Paid</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rentals.map((r) => {
            const overdue = r.status === "active" && r.plannedEndDate != null && r.plannedEndDate < today;
            const total = Number(r.totalAmount ?? 0);
            const paid = Number(r.paid);
            return (
              <tr key={r.id} className="hover:bg-foreground/5">
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link href={`/rentals/${r.id}`} className="font-medium hover:underline">
                    {r.contractNo}
                  </Link>
                </td>
                {!hideCustomer && <td className="px-3 py-2">{r.customerName}</td>}
                <td className="max-w-64 truncate px-3 py-2" title={r.machines ?? ""}>
                  {r.machines ?? "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDate(r.startDate)} – {formatDate(r.actualEndDate ?? r.plannedEndDate)}
                  {overdue && <span className="ml-2 text-xs text-red-600">overdue return</span>}
                </td>
                <td className="px-3 py-2">
                  <ContractStatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.status === "draft" || r.status === "cancelled" ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className={paid >= total ? "text-green-600" : ""}>{formatMoney(paid)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rentals.length === 0 && <p className="p-4 text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}
