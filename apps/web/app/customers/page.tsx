import { CustomerWorkspace } from './workspace';
import './customers.css';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const q = await searchParams;
  return <CustomerWorkspace initialOrg={q.organizationId ?? ''} />;
}
