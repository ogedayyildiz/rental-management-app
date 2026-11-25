import { MaintenanceWorkspace } from './workspace';
import '../rentals/rentals.css';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string; machineId?: string }>;
}) {
  const q = await searchParams;
  return (
    <MaintenanceWorkspace
      initialOrg={q.organizationId ?? ''}
      initialMachine={q.machineId ?? ''}
    />
  );
}
