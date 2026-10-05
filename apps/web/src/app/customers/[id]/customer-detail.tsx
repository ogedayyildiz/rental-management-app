"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CustomerForm } from "@/components/customer-form";
import { Button, ButtonLink } from "@/components/form";
import { RentalTable } from "@/components/rental-table";
import { Card, ErrorMessage, Loading } from "@/components/ui";
import { api, type Customer, type RentalListItem } from "@/lib/api";

export function CustomerDetail({ id }: { id: string }) {
  const customer = useQuery({ queryKey: ["customers", id], queryFn: () => api<Customer>(`/customers/${id}`) });
  const rentals = useQuery({ queryKey: ["rentals"], queryFn: () => api<RentalListItem[]>("/rentals") });
  const [editing, setEditing] = useState(false);

  if (customer.error) return <ErrorMessage error={customer.error} />;
  if (!customer.data) return <Loading />;
  const c = customer.data;
  const theirs = rentals.data?.filter((r) => r.customerId === id) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/customers" className="text-sm text-muted hover:underline">
          ← Customers
        </Link>
        <h1 className="text-xl font-semibold">{c.companyName}</h1>
        <span className="ml-auto flex gap-2">
          <ButtonLink href={`/rentals/new?customerId=${c.id}`}>New offer</ButtonLink>
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </span>
      </div>

      <Card title="Details" className="max-w-3xl">
        {editing ? (
          <CustomerForm customer={c} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted">Tax number</dt>
            <dd>{c.taxNo ?? "—"}</dd>
            <dt className="text-muted">Contact</dt>
            <dd>{[c.contactName, c.phone, c.email].filter(Boolean).join(" · ") || "—"}</dd>
            <dt className="text-muted">Address</dt>
            <dd className="whitespace-pre-line">{c.address ?? "—"}</dd>
            <dt className="text-muted">Notes</dt>
            <dd className="whitespace-pre-line">{c.notes ?? "—"}</dd>
          </dl>
        )}
      </Card>

      <div className="space-y-2">
        <h2 className="font-medium">Offers & rentals</h2>
        <RentalTable rentals={theirs} hideCustomer />
      </div>
    </div>
  );
}
