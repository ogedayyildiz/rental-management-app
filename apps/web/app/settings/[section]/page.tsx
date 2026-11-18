import { notFound } from 'next/navigation';
import { SettingsWorkspace } from '../workspace';
import '../../customers/customers.css';
import '../settings.css';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const { section } = await params;
  const q = await searchParams;
  if (
    ![
      'organization',
      'users',
      'roles',
      'branches',
      'invitations',
      'audit',
    ].includes(section)
  )
    notFound();
  return (
    <SettingsWorkspace section={section} initialOrg={q.organizationId ?? ''} />
  );
}
