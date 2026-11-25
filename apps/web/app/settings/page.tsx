import { SettingsWorkspace } from './workspace';
import '../customers/customers.css';
import './settings.css';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const q = await searchParams;
  return (
    <SettingsWorkspace section="account" initialOrg={q.organizationId ?? ''} />
  );
}
