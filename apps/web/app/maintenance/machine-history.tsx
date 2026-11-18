'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createMaintenanceClient } from '@rental/api-client';
import type { WorkOrderView } from '@rental/validation';
import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
const api = createMaintenanceClient('/api/backend');
export function MachineMaintenanceHistory({
  org,
  machineId,
  locale,
}: {
  org: string;
  machineId: string;
  locale: Locale;
}) {
  const [rows, setRows] = useState<WorkOrderView[]>([]),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api.list(
        org,
        new URLSearchParams({ machineId, open: 'true', limit: '10' }),
      ),
      api.list(
        org,
        new URLSearchParams({ machineId, status: 'COMPLETED', limit: '5' }),
      ),
    ])
      .then(([open, recent]) => {
        if (alive) {
          setFailed(false);
          setRows([...open.items, ...recent.items]);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [org, machineId]);
  const t = (k: TranslationKey) => translate(locale, k);
  return (
    <section>
      <h3>{t('maintenance.history')}</h3>
      {failed && <p role="alert">{t('maintenance.error')}</p>}
      {rows.map((row) => (
        <p key={row.id}>
          <Link href={'/maintenance/' + row.id + '?organizationId=' + org}>
            {row.number} · {row.title}
          </Link>{' '}
          · {t(('maintenance.' + row.status) as TranslationKey)}
        </p>
      ))}
      <Link
        href={'/maintenance?machineId=' + machineId + '&organizationId=' + org}
      >
        {t('maintenance.title')}
      </Link>
    </section>
  );
}
