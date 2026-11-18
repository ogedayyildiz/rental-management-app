import { MachineWorkspace } from './workspace';
import './machines.css';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const q = await searchParams;
  return <MachineWorkspace initialOrg={q.organizationId ?? ''} />;
}
