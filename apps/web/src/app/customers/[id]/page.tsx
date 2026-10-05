import { CustomerDetail } from "./customer-detail";

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  return <CustomerDetail id={id} />;
}
