import { RentalWorkspace } from './workspace';
import './rentals.css';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const q = await searchParams;
  return <RentalWorkspace initialOrg={q.organizationId ?? ''} />;
}
