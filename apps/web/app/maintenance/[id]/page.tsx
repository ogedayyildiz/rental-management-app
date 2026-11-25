import { MaintenanceWorkspace } from '../workspace';
import '../../rentals/rentals.css';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await searchParams;
  return (
    <MaintenanceWorkspace initialId={id} initialOrg={organizationId ?? ''} />
  );
}
