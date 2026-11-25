import { TelemetryView } from './view';
export default async function TelemetryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TelemetryView id={id} />;
}
