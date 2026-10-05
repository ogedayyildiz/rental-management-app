"use client";

import { useQuery } from "@tanstack/react-query";
import { MachineForm } from "@/components/machine-form";
import { ErrorMessage, Loading } from "@/components/ui";
import { api, type MachineDetail } from "@/lib/api";

export function EditMachine({ id }: { id: string }) {
  const { data, error } = useQuery({ queryKey: ["machine", id], queryFn: () => api<MachineDetail>(`/machines/${id}`) });
  if (error) return <ErrorMessage error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit {data.name}</h1>
      {/* key: re-mount the form if the machine changes underneath */}
      <MachineForm key={data.id} machine={data} />
    </div>
  );
}
