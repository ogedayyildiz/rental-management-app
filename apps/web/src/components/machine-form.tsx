"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, Select, Textarea, opt, optNum } from "@/components/form";
import { Card } from "@/components/ui";
import { api, patch, post, type Depot, type MachineDetail, type MachineModel } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/format";

const NEW_MODEL = "__new__";
const MANUAL_STATUSES = ["available", "maintenance", "out_of_service", "retired"] as const;
const CATEGORIES = [
  "scissor_lift",
  "boom_lift",
  "mini_excavator",
  "excavator",
  "skid_steer",
  "telehandler",
  "forklift",
  "generator",
  "compressor",
  "other",
];

/** Create (no `machine`) or edit an existing machine. */
export function MachineForm({ machine }: { machine?: MachineDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const models = useQuery({ queryKey: ["machine-models"], queryFn: () => api<MachineModel[]>("/machine-models") });
  const depots = useQuery({ queryKey: ["depots"], queryFn: () => api<Depot[]>("/depots") });

  const [f, setF] = useState({
    name: machine?.name ?? "",
    serialNo: machine?.serialNo ?? "",
    modelId: machine?.modelId ?? "",
    homeDepotId: machine?.homeDepotId ?? "",
    year: machine?.year?.toString() ?? "",
    purchaseDate: machine?.purchaseDate ?? "",
    purchasePrice: machine?.purchasePrice ? String(Number(machine.purchasePrice)) : "",
    gpsDeviceId: machine?.device?.externalId ?? "",
    status: machine?.status ?? "available",
    notes: machine?.notes ?? "",
  });
  const [m, setM] = useState({ manufacturer: "", model: "", category: "scissor_lift", dailyRate: "", weeklyRate: "", monthlyRate: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });
  const setModel = (k: keyof typeof m) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setM({ ...m, [k]: e.target.value });

  const save = useMutation({
    mutationFn: async () => {
      let modelId = f.modelId;
      if (modelId === NEW_MODEL) {
        const created = await post<{ id: string }>("/machine-models", {
          manufacturer: m.manufacturer,
          model: m.model,
          category: m.category,
          dailyRate: optNum(m.dailyRate),
          weeklyRate: optNum(m.weeklyRate),
          monthlyRate: optNum(m.monthlyRate),
        });
        modelId = created.id;
      }
      const body = {
        modelId,
        name: f.name.trim(),
        serialNo: f.serialNo.trim(),
        homeDepotId: opt(f.homeDepotId),
        year: optNum(f.year),
        purchaseDate: opt(f.purchaseDate),
        purchasePrice: optNum(f.purchasePrice),
        notes: opt(f.notes),
      };
      if (machine) {
        // Empty GPS id on edit means "remove the device"
        await patch(`/machines/${machine.id}`, { ...body, gpsDeviceId: f.gpsDeviceId.trim(), ...(machine.status !== "rented" && { status: f.status }) });
        return machine.id;
      }
      const created = await post<{ id: string }>("/machines", { ...body, gpsDeviceId: opt(f.gpsDeviceId) });
      return created.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries();
      router.push(`/machines/${id}`);
    },
  });

  const isNewModel = f.modelId === NEW_MODEL;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="max-w-3xl space-y-6"
    >
      <Card title="Machine">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fleet number / name *" hint="e.g. SL-051">
            <Input required value={f.name} onChange={set("name")} />
          </Field>
          <Field label="Serial number *">
            <Input required value={f.serialNo} onChange={set("serialNo")} />
          </Field>
          <Field label="Model *" className="sm:col-span-2">
            <Select required value={f.modelId} onChange={set("modelId")}>
              <option value="">Choose a model…</option>
              {models.data?.map((mm) => (
                <option key={mm.id} value={mm.id}>
                  {mm.manufacturer} {mm.model} ({mm.category.replace("_", " ")})
                </option>
              ))}
              <option value={NEW_MODEL}>+ Add a new model…</option>
            </Select>
          </Field>
        </div>

        {isNewModel && (
          <div className="mt-4 grid gap-4 rounded-md border border-dashed border-border p-4 sm:grid-cols-3">
            <Field label="Manufacturer *">
              <Input required value={m.manufacturer} onChange={setModel("manufacturer")} />
            </Field>
            <Field label="Model *">
              <Input required value={m.model} onChange={setModel("model")} />
            </Field>
            <Field label="Category *">
              <Select value={m.category} onChange={setModel("category")}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Daily rate (₺)" hint="Pre-fills offers">
              <Input type="number" min="0" step="any" value={m.dailyRate} onChange={setModel("dailyRate")} />
            </Field>
            <Field label="Weekly rate (₺)">
              <Input type="number" min="0" step="any" value={m.weeklyRate} onChange={setModel("weeklyRate")} />
            </Field>
            <Field label="Monthly rate (₺)">
              <Input type="number" min="0" step="any" value={m.monthlyRate} onChange={setModel("monthlyRate")} />
            </Field>
          </div>
        )}
      </Card>

      <Card title="Tracking & status">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GPS device ID" hint="The IMEI / serial the GPS provider reports. Leave empty if not fitted.">
            <Input value={f.gpsDeviceId} onChange={set("gpsDeviceId")} placeholder="e.g. 356938035643809" />
          </Field>
          <Field label="Home depot">
            <Select value={f.homeDepotId} onChange={set("homeDepotId")}>
              <option value="">—</option>
              {depots.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          {machine && (
            <Field
              label="Status"
              hint={machine.status === "rented" ? "On rent: changes when the rental is completed." : "Rented is set automatically by rentals."}
            >
              <Select value={f.status} onChange={set("status")} disabled={machine.status === "rented"}>
                {machine.status === "rented" && <option value="rented">Rented</option>}
                {MANUAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <Card title="Purchase">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Year">
            <Input type="number" min="1950" max="2100" value={f.year} onChange={set("year")} />
          </Field>
          <Field label="Purchase date">
            <Input type="date" value={f.purchaseDate} onChange={set("purchaseDate")} />
          </Field>
          <Field label="Purchase price (₺)">
            <Input type="number" min="0" step="any" value={f.purchasePrice} onChange={set("purchasePrice")} />
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <Textarea value={f.notes} onChange={set("notes")} />
          </Field>
        </div>
      </Card>

      <FormError error={save.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : machine ? "Save changes" : "Add machine"}
        </Button>
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
