"use client";

import { rentalDays, rentalUnits } from "@rental/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink, Field, FormError, Input, opt } from "@/components/form";
import { ContractStatusBadge } from "@/components/rental-table";
import { Card, ErrorMessage, Loading } from "@/components/ui";
import { api, post, type Payment, type RentalDetail } from "@/lib/api";
import { formatDate, formatMoney, RATE_UNIT, todayIso } from "@/lib/format";

const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Demo Rental Co.";

type Action = "confirm" | "start" | "complete" | "cancel";
const ACTION_CONFIRM: Partial<Record<Action, string>> = {
  cancel: "Cancel this? The machines will be released.",
  complete: "Mark all machines as returned and complete the rental?",
};

export function RentalView({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { data: r, error } = useQuery({ queryKey: ["rental", id], queryFn: () => api<RentalDetail>(`/rentals/${id}`) });

  const action = useMutation({
    mutationFn: (a: Action) => post(`/rentals/${id}/${a}`),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const run = (a: Action) => {
    if (ACTION_CONFIRM[a] && !window.confirm(ACTION_CONFIRM[a])) return;
    action.mutate(a);
  };

  if (error) return <ErrorMessage error={error} />;
  if (!r) return <Loading />;

  const isOffer = r.status === "draft";
  const lines = r.items.filter((i) => !i.cancelledAt || r.status === "cancelled");
  const days = r.plannedEndDate ? rentalDays(r.startDate, r.plannedEndDate) : 0;
  const total = Number(r.totalAmount ?? 0);
  const contact = r.customer.contacts?.[0];

  return (
    <div className="max-w-5xl space-y-6">
      {/* Screen header with actions */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/rentals" className="text-sm text-muted hover:underline">
          ← Offers & rentals
        </Link>
        <h1 className="text-xl font-semibold">{r.contractNo}</h1>
        <ContractStatusBadge status={r.status} />
        <span className="ml-auto flex flex-wrap gap-2">
          {isOffer && (
            <>
              <ButtonLink href={`/rentals/${id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
              <Button onClick={() => run("confirm")} disabled={action.isPending}>
                Customer accepted → confirm
              </Button>
            </>
          )}
          {r.status === "reserved" && (
            <Button onClick={() => run("start")} disabled={action.isPending}>
              Machines delivered → start rental
            </Button>
          )}
          {r.status === "active" && (
            <Button onClick={() => run("complete")} disabled={action.isPending}>
              Machines returned → complete
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            Print / PDF
          </Button>
          {(isOffer || r.status === "reserved") && (
            <Button variant="danger" onClick={() => run("cancel")} disabled={action.isPending}>
              {isOffer ? "Cancel offer" : "Cancel booking"}
            </Button>
          )}
        </span>
      </div>
      <FormError error={action.error} />

      {/* Document: what gets printed */}
      <article className="space-y-6 rounded-lg border border-border bg-surface p-6 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{COMPANY_NAME}</div>
            <div className="text-sm text-muted">{isOffer ? "Rental offer" : "Rental agreement"}</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{r.contractNo}</div>
            <div className="text-muted">Date {formatDate(r.createdAt)}</div>
          </div>
        </header>

        <div className="grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-muted uppercase">Customer</div>
            <Link href={`/customers/${r.customer.id}`} className="font-medium hover:underline">
              {r.customer.companyName}
            </Link>
            {r.customer.taxNo && <div>Tax no {r.customer.taxNo}</div>}
            {r.customer.address && <div className="whitespace-pre-line">{r.customer.address}</div>}
            {contact && <div>{[contact.name, contact.phone, contact.email].filter(Boolean).join(" · ")}</div>}
          </div>
          <div>
            <div className="mb-1 text-xs text-muted uppercase">Rental period</div>
            <div className="font-medium">
              {formatDate(r.startDate)} – {formatDate(r.plannedEndDate)} ({days} days)
            </div>
            {r.actualEndDate && <div>Returned {formatDate(r.actualEndDate)}</div>}
            {r.siteAddress && <div className="mt-1">Site: {r.siteAddress}</div>}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">Machine</th>
              <th className="py-2 pr-3 font-medium">Rate</th>
              <th className="py-2 pr-3 text-right font-medium">Qty</th>
              <th className="py-2 pr-3 text-right font-medium">Delivery</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((i) => (
              <tr key={i.id}>
                <td className="py-2 pr-3">
                  <Link href={`/machines/${i.machineId}`} className="font-medium hover:underline print:no-underline">
                    {i.machineName}
                  </Link>
                  <div className="text-xs text-muted">
                    {i.manufacturer} {i.model} · S/N {i.serialNo}
                  </div>
                  {(i.startEngineHours != null || i.endEngineHours != null) && (
                    <div className="text-xs text-muted print:hidden">
                      Hour meter {i.startEngineHours?.toFixed(1) ?? "—"} → {i.endEngineHours?.toFixed(1) ?? "—"}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {formatMoney(i.rate)} / {RATE_UNIT[i.rateType]}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{rentalUnits(i.rateType, days)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {Number(i.deliveryFee) ? formatMoney(i.deliveryFee) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">{formatMoney(i.amount ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-base font-semibold">
              <td className="py-2" colSpan={4}>
                Total (excl. VAT)
              </td>
              <td className="py-2 text-right tabular-nums">{formatMoney(total)}</td>
            </tr>
          </tfoot>
        </table>

        {r.terms && (
          <div className="text-sm">
            <div className="mb-1 text-xs text-muted uppercase">Terms</div>
            <p className="whitespace-pre-line">{r.terms}</p>
          </div>
        )}

        <div className="hidden grid-cols-2 gap-12 pt-12 text-sm print:grid">
          <div className="border-t border-foreground/40 pt-2">For {COMPANY_NAME}</div>
          <div className="border-t border-foreground/40 pt-2">For {r.customer.companyName}</div>
        </div>
      </article>

      {r.status !== "draft" && r.status !== "cancelled" && <Payments rental={r} />}
    </div>
  );
}

function Payments({ rental }: { rental: RentalDetail }) {
  const queryClient = useQueryClient();
  const total = Number(rental.totalAmount ?? 0);
  const received = rental.payments.filter((p) => p.status === "received").reduce((s, p) => s + Number(p.amount), 0);
  const scheduled = rental.payments.filter((p) => p.status !== "written_off").reduce((s, p) => s + Number(p.amount), 0);
  const unscheduled = Math.max(0, Math.round((total - scheduled) * 100) / 100);

  const defaultDue = rental.plannedEndDate
    ? new Date(Date.parse(`${rental.plannedEndDate}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10)
    : todayIso();
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(defaultDue);
  const [method, setMethod] = useState("");

  const add = useMutation({
    mutationFn: () =>
      post(`/rentals/${rental.id}/payments`, {
        amount: Number(amount || unscheduled),
        dueDate: opt(dueDate),
        method: opt(method),
      }),
    onSuccess: async () => {
      setAmount("");
      await queryClient.invalidateQueries();
    },
  });
  const receive = useMutation({
    mutationFn: (p: Payment) => post(`/payments/${p.id}/receive`, {}),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const today = todayIso();
  return (
    <Card title="Payments" className="print:hidden">
      <div className="mb-4 flex flex-wrap gap-6 text-sm">
        <span>
          Total <b className="tabular-nums">{formatMoney(total)}</b>
        </span>
        <span>
          Received <b className="text-green-600 tabular-nums">{formatMoney(received)}</b>
        </span>
        <span>
          Open <b className="tabular-nums">{formatMoney(Math.max(0, total - received))}</b>
        </span>
      </div>

      {rental.payments.length > 0 && (
        <table className="mb-4 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Amount</th>
              <th className="py-1 pr-3 font-medium">Due</th>
              <th className="py-1 pr-3 font-medium">Status</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rental.payments.map((p) => {
              const overdue = p.status === "expected" && p.dueDate != null && p.dueDate < today;
              return (
                <tr key={p.id}>
                  <td className="py-2 pr-3 tabular-nums">{formatMoney(p.amount)}</td>
                  <td className="py-2 pr-3">{formatDate(p.dueDate)}</td>
                  <td className="py-2 pr-3">
                    {p.status === "received" ? (
                      <span className="text-green-600">
                        Received {formatDate(p.receivedAt)}
                        {p.method && ` · ${p.method}`}
                      </span>
                    ) : overdue ? (
                      <span className="text-red-600">Overdue</span>
                    ) : (
                      <span className="text-muted">Expected</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {p.status !== "received" && (
                      <Button variant="secondary" onClick={() => receive.mutate(p)} disabled={receive.isPending}>
                        Mark received
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="grid items-end gap-3 sm:grid-cols-4">
        <Field label="Amount (₺)" hint={unscheduled > 0 ? `${formatMoney(unscheduled)} not yet scheduled` : undefined}>
          <Input
            type="number"
            min="0"
            step="any"
            value={amount}
            placeholder={unscheduled ? String(unscheduled) : ""}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Method">
          <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Bank transfer, card…" />
        </Field>
        <Button onClick={() => add.mutate()} disabled={add.isPending || !(Number(amount) > 0 || unscheduled > 0)}>
          Add expected payment
        </Button>
      </div>
      <div className="mt-3">
        <FormError error={add.error ?? receive.error} />
      </div>
    </Card>
  );
}
