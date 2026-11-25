'use client';
import { translate } from '@rental/i18n';
import { useApplication } from '../../../app-shell';
import { MachineTelemetry } from '../../../devices/machine-telemetry';
export function TelemetryView({ id }: { id: string }) {
  const { account, org, locale } = useApplication();
  const access = account?.organizations.find(
    (o) => o.access?.organizationId === org,
  )?.access;
  return (
    <main>
      <h1>{translate(locale, 'iot.telemetry')}</h1>
      {access?.permissions.includes('telemetry.read') ? (
        <MachineTelemetry org={org} id={id} locale={locale} />
      ) : (
        <p role="alert">{translate(locale, 'ops.denied')}</p>
      )}
    </main>
  );
}
