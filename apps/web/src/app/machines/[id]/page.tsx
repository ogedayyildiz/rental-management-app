import { MachineDetailView } from "./machine-detail";

export default async function MachinePage({ params }: PageProps<"/machines/[id]">) {
  const { id } = await params;
  return <MachineDetailView id={id} />;
}
