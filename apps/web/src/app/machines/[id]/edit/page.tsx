import { EditMachine } from "./edit-machine";

export default async function EditMachinePage({ params }: PageProps<"/machines/[id]/edit">) {
  const { id } = await params;
  return <EditMachine id={id} />;
}
