import { MachineWorkspace } from '../workspace';
import '../machines.css';
export default async function MachinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await searchParams;
  return (
    <MachineWorkspace
      initialId={id}
      {...(organizationId ? { initialOrg: organizationId } : {})}
    />
  );
}
