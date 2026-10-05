"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { OfferForm } from "@/components/offer-form";
import { ErrorMessage, Loading } from "@/components/ui";
import { api, type RentalDetail } from "@/lib/api";

export function EditOffer({ id }: { id: string }) {
  const { data, error } = useQuery({ queryKey: ["rental", id], queryFn: () => api<RentalDetail>(`/rentals/${id}`) });
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <Loading />;
  if (data.status !== "draft") {
    return (
      <p className="text-sm">
        {data.contractNo} is no longer an offer and can&apos;t be edited.{" "}
        <Link href={`/rentals/${id}`} className="underline">
          Back
        </Link>
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit offer {data.contractNo}</h1>
      <OfferForm key={data.id} rental={data} />
    </div>
  );
}
