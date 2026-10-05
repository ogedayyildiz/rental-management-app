import { RentalView } from "./rental-view";

export default async function RentalPage({ params }: PageProps<"/rentals/[id]">) {
  const { id } = await params;
  return <RentalView id={id} />;
}
