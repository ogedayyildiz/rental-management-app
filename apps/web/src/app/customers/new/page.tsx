"use client";

import { useRouter } from "next/navigation";
import { CustomerForm } from "@/components/customer-form";
import { Card } from "@/components/ui";

export default function NewCustomerPage() {
  const router = useRouter();
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Add customer</h1>
      <Card>
        <CustomerForm onSaved={(c) => router.push(`/customers/${c.id}`)} onCancel={() => router.back()} />
      </Card>
    </div>
  );
}
