"use client";

import { MachineForm } from "@/components/machine-form";

export default function NewMachinePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Add machine</h1>
      <MachineForm />
    </div>
  );
}
