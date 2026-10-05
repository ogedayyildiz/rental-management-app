import { OfferForm } from "@/components/offer-form";

export default async function NewOfferPage({ searchParams }: PageProps<"/rentals/new">) {
  const { customerId, machineId } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">New offer</h1>
      <OfferForm
        initialCustomerId={typeof customerId === "string" ? customerId : undefined}
        initialMachineId={typeof machineId === "string" ? machineId : undefined}
      />
    </div>
  );
}
