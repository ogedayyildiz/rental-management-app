"use client";

import { rentalDays, rentalLineAmount } from "@rental/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CustomerForm } from "@/components/customer-form";
import { Button, Field, FormError, Input, Select, Textarea, opt } from "@/components/form";
import { Card } from "@/components/ui";
import {
  api,
  post,
  put,
  type Customer,
  type MachineAvailability,
  type RateType,
  type RentalDetail,
} from "@/lib/api";
import { formatDate, formatMoney, RATE_TYPE_LABEL, STATUS_LABEL, todayIso } from "@/lib/format";
import type { MachineStatus } from "@rental/shared";

interface Line {
  machineId: string;
  rateType: RateType;
  /** "" = use the model's list price for the rate type */
  rate: string;
  deliveryFee: string;
}

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

function listPrice(m: MachineAvailability | undefined, rateType: RateType): string {
  if (!m) return "";
  const price = { hourly: null, daily: m.dailyRate, weekly: m.weeklyRate, monthly: m.monthlyRate }[rateType];
  return price ? String(Number(price)) : "";
}

/** Create an offer, or edit one (`rental`) while it is still an offer. */
export function OfferForm({
  rental,
  initialCustomerId,
  initialMachineId,
}: {
  rental?: RentalDetail;
  initialCustomerId?: string;
  initialMachineId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState(rental?.customer.id ?? initialCustomerId ?? "");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [startDate, setStartDate] = useState(rental?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(rental?.plannedEndDate ?? addDays(todayIso(), 6));
  const [siteAddress, setSiteAddress] = useState(rental?.siteAddress ?? "");
  const [terms, setTerms] = useState(rental?.terms ?? "");
  const [lines, setLines] = useState<Line[]>(
    rental
      ? rental.items
          .filter((i) => !i.cancelledAt)
          .map((i) => ({
            machineId: i.machineId,
            rateType: i.rateType,
            rate: String(Number(i.rate)),
            deliveryFee: String(Number(i.deliveryFee)),
          }))
      : initialMachineId
        ? [{ machineId: initialMachineId, rateType: "daily", rate: "", deliveryFee: "0" }]
        : [],
  );
  const [search, setSearch] = useState("");

  const customers = useQuery({ queryKey: ["customers"], queryFn: () => api<Customer[]>("/customers") });
  const datesValid = startDate !== "" && endDate !== "" && endDate >= startDate;
  const availability = useQuery({
    queryKey: ["availability", startDate, endDate, rental?.id],
    queryFn: () =>
      api<MachineAvailability[]>(
        `/machines/availability?from=${startDate}&to=${endDate}${rental ? `&excludeContractId=${rental.id}` : ""}`,
      ),
    enabled: datesValid,
    placeholderData: (prev) => prev,
  });
  const byId = useMemo(() => new Map((availability.data ?? []).map((m) => [m.id, m])), [availability.data]);

  const days = datesValid ? rentalDays(startDate, endDate) : 0;
  const effectiveRate = (l: Line) => (l.rate !== "" ? l.rate : listPrice(byId.get(l.machineId), l.rateType));
  const lineTotal = (l: Line) =>
    rentalLineAmount({ rateType: l.rateType, rate: Number(effectiveRate(l) || 0), deliveryFee: Number(l.deliveryFee || 0) }, days);
  const total = lines.reduce((sum, l) => sum + lineTotal(l), 0);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const q = search.trim().toLocaleLowerCase("tr");
  const candidates = (availability.data ?? []).filter(
    (m) =>
      !lines.some((l) => l.machineId === m.id) &&
      (!q || `${m.name} ${m.manufacturer} ${m.model} ${m.category}`.toLocaleLowerCase("tr").includes(q)),
  );

  const save = useMutation({
    mutationFn: async () => {
      const missingRate = lines.find((l) => effectiveRate(l) === "");
      if (missingRate) throw new Error(`Enter a rate for ${byId.get(missingRate.machineId)?.name ?? "each machine"}.`);
      const body = {
        customerId,
        startDate,
        endDate,
        siteAddress: opt(siteAddress),
        terms: opt(terms),
        items: lines.map((l) => ({
          machineId: l.machineId,
          rateType: l.rateType,
          rate: Number(effectiveRate(l)),
          deliveryFee: Number(l.deliveryFee || 0),
        })),
      };
      if (rental) {
        await put(`/rentals/${rental.id}`, body);
        return rental.id;
      }
      return (await post<{ id: string }>("/rentals", body)).id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries();
      router.push(`/rentals/${id}`);
    },
  });

  return (
    // A <div>, not a <form>: the inline "new customer" form must not be nested in another form.
    <div className="max-w-5xl space-y-6">
      <Card title="Customer & period">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Customer *" className="sm:col-span-2">
            <div className="flex gap-2">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Choose a customer…</option>
                {customers.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={() => setAddingCustomer(!addingCustomer)}>
                + New
              </Button>
            </div>
          </Field>
          <Field label="From *">
            <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Until (inclusive) *" hint={datesValid ? `${days} day${days === 1 ? "" : "s"}` : "Must be on or after the start"}>
            <Input type="date" required min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Site / delivery address" className="sm:col-span-4">
            <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
          </Field>
        </div>
      </Card>

      {addingCustomer && (
        <Card title="New customer">
          <CustomerForm
            onSaved={(c) => {
              setCustomerId(c.id);
              setAddingCustomer(false);
            }}
            onCancel={() => setAddingCustomer(false)}
          />
        </Card>
      )}

      <Card title="Machines">
        {lines.length > 0 ? (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Machine</th>
                  <th className="py-2 pr-3 font-medium">Rate type</th>
                  <th className="py-2 pr-3 font-medium">Rate (₺)</th>
                  <th className="py-2 pr-3 font-medium">Delivery (₺)</th>
                  <th className="py-2 pr-3 text-right font-medium">Line total</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l, i) => {
                  const m = byId.get(l.machineId);
                  return (
                    <tr key={l.machineId}>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{m?.name ?? "…"}</div>
                        <div className="text-xs text-muted">
                          {m && `${m.manufacturer} ${m.model}`}
                          {m && !m.available && (
                            <span className="ml-1 text-red-600">
                              {m.conflict
                                ? `· booked on ${m.conflict.contractNo} (${formatDate(m.conflict.startDate)}–${formatDate(m.conflict.endDate)})`
                                : `· ${STATUS_LABEL[m.status as MachineStatus] ?? m.status}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <Select value={l.rateType} onChange={(e) => updateLine(i, { rateType: e.target.value as RateType, rate: "" })}>
                          {(Object.keys(RATE_TYPE_LABEL) as RateType[]).map((t) => (
                            <option key={t} value={t}>
                              {RATE_TYPE_LABEL[t]}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="w-28"
                          value={effectiveRate(l)}
                          onChange={(e) => updateLine(i, { rate: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="w-28"
                          value={l.deliveryFee}
                          onChange={(e) => updateLine(i, { deliveryFee: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(lineTotal(l))}</td>
                      <td className="py-2 text-right">
                        <Button variant="secondary" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="py-2" colSpan={4}>
                    Total ({days} days)
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted">No machines yet. Add them from the list below.</p>
        )}

        <div className="space-y-2 rounded-md border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              Add machines{" "}
              <span className="font-normal text-muted">
                · availability for {formatDate(startDate)} – {formatDate(endDate)}
              </span>
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, model, type…"
              className="max-w-64"
            />
          </div>
          {!datesValid ? (
            <p className="text-sm text-muted">Choose valid dates to see availability.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto text-sm">
              {candidates.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{m.name}</span>{" "}
                    <span className="text-muted">
                      {m.manufacturer} {m.model}
                      {m.dailyRate && ` · ${formatMoney(m.dailyRate)}/day`}
                    </span>
                  </span>
                  {m.available ? (
                    <Button
                      variant="secondary"
                      onClick={() => setLines([...lines, { machineId: m.id, rateType: "daily", rate: "", deliveryFee: "0" }])}
                    >
                      Add
                    </Button>
                  ) : (
                    <span className="text-xs text-red-600">
                      {m.conflict
                        ? `Booked · ${m.conflict.contractNo} (${formatDate(m.conflict.startDate)}–${formatDate(m.conflict.endDate)})`
                        : STATUS_LABEL[m.status as MachineStatus] ?? m.status}
                    </span>
                  )}
                </li>
              ))}
              {candidates.length === 0 && <li className="py-2 text-muted">No machines match.</li>}
            </ul>
          )}
        </div>
      </Card>

      <Card title="Terms">
        <Textarea
          rows={4}
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="Payment terms, fuel/charging, insurance, operator… (printed on the offer)"
        />
      </Card>

      <FormError error={save.error} />
      <div className="flex gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending || lines.length === 0 || !customerId || !datesValid}>
          {save.isPending ? "Saving…" : rental ? "Save offer" : "Create offer"}
        </Button>
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
