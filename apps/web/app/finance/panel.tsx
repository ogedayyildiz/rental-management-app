'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { translate, type Locale } from '@rental/i18n';
import { createAnalyticsClient } from '@rental/api-client';
import type { AnalyticsRow } from '@rental/validation';
import { Performance } from './views';
type PanelProps = {
  org: string;
  id: string;
  kind: 'machine' | 'customer';
  locale: Locale;
};
export function FinancePanel(props: PanelProps) {
  return <LoadedPanel key={props.org + props.id + props.kind} {...props} />;
}
function LoadedPanel({ org, id, kind, locale }: PanelProps) {
  const [row, setRow] = useState<AnalyticsRow | null>(null),
    [error, setError] = useState(false),
    [timezone, setTimezone] = useState('UTC'),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({
      preset: 'LAST_12_MONTHS',
      group: kind,
      [kind + 'Id']: id,
    });
    void createAnalyticsClient('/api/backend')
      .report(org, q)
      .then((r) => {
        if (live) {
          setRow(r.items[0] ?? null);
          setTimezone(r.timezone);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [org, id, kind]);
  return (
    <section>
      <h3>{translate(locale, 'finance.title')}</h3>
      <p>{translate(locale, 'finance.notice')}</p>
      {error ? (
        <p role="alert">{translate(locale, 'finance.error')}</p>
      ) : row ? (
        <Performance row={row} locale={locale} timezone={timezone} />
      ) : loaded ? (
        <p>{translate(locale, 'finance.empty')}</p>
      ) : (
        <p>{translate(locale, 'finance.loading')}</p>
      )}
      <Link href={`/finance?organizationId=${org}&${kind}Id=${id}`}>
        {translate(locale, 'finance.annual')}
      </Link>
    </section>
  );
}
