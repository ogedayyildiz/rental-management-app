'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createOperationsClient } from '@rental/api-client';
import { translate, type TranslationKey } from '@rental/i18n';
import { useApplication } from '../app-shell';
const api = createOperationsClient('/api/backend');
export default function Search() {
  const { org } = useApplication(),
    q = useSearchParams().get('q') ?? '';
  return <SearchResults key={org + ':' + q} q={q} />;
}
function SearchResults({ q }: { q: string }) {
  const { org, locale } = useApplication();
  const [data, D] = useState<Awaited<ReturnType<typeof api.search>> | null>(
      null,
    ),
    [error, E] = useState(false);
  const t = (k: string) => translate(locale, ('ops.' + k) as TranslationKey);
  useEffect(() => {
    let live = true;
    if (org && q.trim())
      api
        .search(org, q)
        .then((v) => {
          if (live) D(v);
        })
        .catch(() => {
          if (live) E(true);
        });
    return () => {
      live = false;
    };
  }, [org, q]);
  return (
    <main className="operations-page">
      <h1>{t('globalSearch')}</h1>
      <p>{q}</p>
      {error ? (
        <p role="alert">{t('networkError')}</p>
      ) : !q.trim() ? (
        <p>{t('searchHint')}</p>
      ) : !data ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          {data.items.length ? (
            <ul className="operations-events">
              {data.items.map((i) => (
                <li key={`${i.source}:${i.id}`}>
                  <span>{t(i.source)}</span> ·{' '}
                  <Link href={i.href}>{i.label}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">{t('searchEmpty')}</p>
          )}
          {data.limited && <p>{t('searchLimited')}</p>}
        </>
      )}
    </main>
  );
}
