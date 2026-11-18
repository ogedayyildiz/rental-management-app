import { FinanceWorkspace } from './workspace';
import './finance.css';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    organizationId?: string;
    machineId?: string;
    customerId?: string;
  }>;
}) {
  const q = await searchParams;
  return (
    <FinanceWorkspace
      initialOrg={q.organizationId ?? ''}
      initialMachine={q.machineId ?? ''}
      initialCustomer={q.customerId ?? ''}
    />
  );
}
