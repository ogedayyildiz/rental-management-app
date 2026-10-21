import { RentalWorkspace } from '../workspace';
import '../rentals.css';
export default async function RentalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const { id } = await params;
  const { organizationId } = await searchParams;
  return (
    <RentalWorkspace
      initialId={id}
      {...(organizationId ? { initialOrg: organizationId } : {})}
    />
  );
}
