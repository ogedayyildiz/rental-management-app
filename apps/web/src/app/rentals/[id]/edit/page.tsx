import { EditOffer } from "./edit-offer";

export default async function EditOfferPage({ params }: PageProps<"/rentals/[id]/edit">) {
  const { id } = await params;
  return <EditOffer id={id} />;
}
