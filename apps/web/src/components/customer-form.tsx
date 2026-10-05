"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Field, FormError, Input, Textarea } from "@/components/form";
import { patch, post, type Customer } from "@/lib/api";

/** Create or edit a customer. `onSaved` receives the saved customer. */
export function CustomerForm({
  customer,
  onSaved,
  onCancel,
}: {
  customer?: Customer;
  onSaved: (c: Customer) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({
    companyName: customer?.companyName ?? "",
    taxNo: customer?.taxNo ?? "",
    contactName: customer?.contactName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]));
      return customer ? patch<Customer>(`/customers/${customer.id}`, body) : post<Customer>("/customers", body);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      onSaved(saved);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        save.mutate();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name *" className="sm:col-span-2">
          <Input required value={f.companyName} onChange={set("companyName")} />
        </Field>
        <Field label="Tax number">
          <Input value={f.taxNo} onChange={set("taxNo")} />
        </Field>
        <Field label="Contact person">
          <Input value={f.contactName} onChange={set("contactName")} />
        </Field>
        <Field label="Phone">
          <Input type="tel" value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} onChange={set("email")} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea rows={2} value={f.address} onChange={set("address")} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={f.notes} onChange={set("notes")} />
        </Field>
      </div>
      <FormError error={save.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : customer ? "Save changes" : "Add customer"}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
