'use client';
import { useAppLocale } from '../app-shell';
import { accountResponse } from '../../lib/account';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { translate, type TranslationKey } from '@rental/i18n';
import { createAnalyticsClient } from '@rental/api-client';
import {
  machineAccessSchema,
  rentalCatalogSchema,
  type AnalyticsReport,
  type AnalyticsQuery,
} from '@rental/validation';
import { MoneyValues, Performance, Trend } from './views';
type Org = { id: string; name: string; permissions: string[] };
export function FinanceWorkspace({
  initialOrg,
  initialMachine,
  initialCustomer,
}: {
  initialOrg: string;
  initialMachine: string;
  initialCustomer: string;
}) {
  const [locale] = useAppLocale(),
    [orgs, O] = useState<Org[]>([]),
    [org, S] = useState(initialOrg),
    [loaded, Loaded] = useState(false),
    [error, E] = useState(false),
    [report, R] = useState<AnalyticsReport | null>(null),
    [busy, B] = useState(true);
  const [preset, P] = useState<AnalyticsQuery['preset']>('THIS_MONTH'),
    [group, G] = useState<AnalyticsQuery['group']>(
      initialCustomer ? 'customer' : 'machine',
    ),
    [machineId, M] = useState(initialMachine),
    [customerId, C] = useState(initialCustomer),
    [from, F] = useState(''),
    [to, T] = useState(''),
    [branchId, Branch] = useState(''),
    [modelId, Model] = useState(''),
    [categoryId, Category] = useState(''),
    [status, Status] = useState(''),
    [currency, Currency] = useState(''),
    [sort, Sort] = useState<AnalyticsQuery['sort']>('ID'),
    [sortCurrency, SortCurrency] = useState(''),
    [query, Q] = useState(
      new URLSearchParams({
        preset: 'THIS_MONTH',
        group: initialCustomer ? 'customer' : 'machine',
        ...(initialMachine ? { machineId: initialMachine } : {}),
        ...(initialCustomer ? { customerId: initialCustomer } : {}),
      }),
    ),
    [cursors, Cursors] = useState<string[]>([]);
  const [catalog, Catalog] = useState<ReturnType<
    typeof rentalCatalogSchema.parse
  > | null>(null);
  const client = useMemo(() => createAnalyticsClient('/api/backend'), []),
    t = (key: TranslationKey) => translate(locale, key);
  const can = (key: string) =>
    orgs.find((x) => x.id === org)?.permissions.includes(key);
  useEffect(() => {
    let live = true;
    void accountResponse()
      .then((r) => r.json())
      .then((v) => {
        if (!live) return;
        const rows = machineAccessSchema.parse(v).organizations.flatMap((o) =>
          o.access?.permissions.includes('finance.analytics.view') &&
          o.access.permissions.includes('machines.read')
            ? [
                {
                  id: o.access.organizationId,
                  name: o.name,
                  permissions: o.access.permissions,
                },
              ]
            : [],
        );
        O(rows);
        S((current) =>
          rows.some((x) => x.id === current)
            ? current
            : !initialOrg
              ? (rows[0]?.id ?? '')
              : '',
        );
        Loaded(true);
        if (
          !rows.length ||
          (initialOrg && !rows.some((r) => r.id === initialOrg))
        )
          B(false);
      })
      .catch(() => {
        if (live) {
          E(true);
          Loaded(true);
          B(false);
        }
      });
    return () => {
      live = false;
    };
  }, [initialOrg]);
  useEffect(() => {
    if (!org || !loaded) return;
    let live = true;
    void client
      .report(org, query)
      .then((r) => {
        if (live) {
          R(r);
          Currency((current) =>
            r.summary.values.some((v) => v.currency === current)
              ? current
              : (r.summary.values[0]?.currency ?? ''),
          );
        }
      })
      .catch(() => {
        if (live) E(true);
      })
      .finally(() => {
        if (live) B(false);
      });
    return () => {
      live = false;
    };
  }, [org, loaded, query, client]);
  useEffect(() => {
    let live = true;
    if (orgs.find((x) => x.id === org)?.permissions.includes('rentals.read'))
      void fetch(`/api/backend/organizations/${org}/rentals/catalog`)
        .then((r) => r.json())
        .then((r) => {
          if (live) Catalog(rentalCatalogSchema.parse(r));
        })
        .catch(() => {
          if (live) Catalog(null);
        });
    return () => {
      live = false;
    };
  }, [org, orgs]);
  function changeQuery(q: URLSearchParams) {
    R(null);
    E(false);
    B(true);
    Q(q);
  }
  function apply() {
    const q = new URLSearchParams({ preset, group, sort, locale });
    if (sort === 'COMPLETED_VALUE') q.set('sortCurrency', sortCurrency);
    for (const [key, value] of Object.entries({
      machineId,
      customerId,
      branchId,
      modelId,
      categoryId,
      status,
    }))
      if (value) q.set(key, value);
    if (preset === 'CUSTOM') {
      if (!from || !to) {
        E(true);
        return;
      }
      const a = new Date(from + 'Z'),
        b = new Date(to + 'Z');
      if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) {
        E(true);
        return;
      }
      q.set('from', a.toISOString());
      q.set('to', b.toISOString());
    }
    Cursors([]);
    changeQuery(q);
  }
  const timestamp = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: report?.timezone ?? 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  return (
    <main className="finance-page">
      <header>
        <h1>{t('finance.title')}</h1>
      </header>
      <p className="finance-notice">{t('finance.notice')}</p>
      {loaded && !org && <p>{t('finance.noAccess')}</p>}
      {error && <p role="alert">{t('finance.error')}</p>}
      {org && orgs.length > 0 && (
        <>
          <form
            className="finance-filters"
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <label>
              {t('finance.period')}
              <select
                value={preset}
                onChange={(e) => P(e.target.value as AnalyticsQuery['preset'])}
              >
                {(
                  [
                    'THIS_MONTH',
                    'PREVIOUS_MONTH',
                    'YEAR_TO_DATE',
                    'LAST_12_MONTHS',
                    'CUSTOM',
                  ] as const
                ).map((k) => (
                  <option key={k} value={k}>
                    {t(`finance.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            {preset === 'CUSTOM' && (
              <>
                <label>
                  {t('finance.from')}
                  <input
                    type="datetime-local"
                    value={from}
                    onChange={(e) => F(e.target.value)}
                    required
                  />
                </label>
                <label>
                  {t('finance.to')}
                  <input
                    type="datetime-local"
                    value={to}
                    onChange={(e) => T(e.target.value)}
                    required
                  />
                </label>
              </>
            )}
            <label>
              {t('finance.group')}
              <select
                value={group}
                onChange={(e) => G(e.target.value as AnalyticsQuery['group'])}
              >
                {(
                  [
                    'machine',
                    'model',
                    'category',
                    'branch',
                    ...(can('customers.read') && can('rentals.read')
                      ? ['customer' as const]
                      : []),
                  ] as const
                ).map((k) => (
                  <option key={k} value={k}>
                    {t(`finance.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            {catalog && (
              <>
                {(
                  [
                    {
                      key: 'branch',
                      value: branchId,
                      set: Branch,
                      rows: catalog.branches,
                    },
                    {
                      key: 'model',
                      value: modelId,
                      set: Model,
                      rows: catalog.models,
                    },
                    {
                      key: 'category',
                      value: categoryId,
                      set: Category,
                      rows: catalog.categories,
                    },
                  ] as const
                ).map((x) => (
                  <label key={x.key}>
                    {t(`finance.${x.key}`)}
                    <select
                      value={x.value}
                      onChange={(e) => x.set(e.target.value)}
                    >
                      <option value="">{t('finance.all')}</option>
                      {x.rows.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </>
            )}
            <label>
              {t('rentals.state')}
              <select value={status} onChange={(e) => Status(e.target.value)}>
                <option value="">{t('finance.all')}</option>
                {(
                  [
                    'DRAFT',
                    'QUOTED',
                    'RESERVED',
                    'ACTIVE',
                    'COMPLETED',
                    'CANCELLED',
                  ] as const
                ).map((k) => (
                  <option key={k} value={k}>
                    {t(`rentals.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>{t('finance.apply')}</button>
            <label>
              {t('finance.sort')}
              <select
                value={sort}
                onChange={(e) => Sort(e.target.value as AnalyticsQuery['sort'])}
              >
                <option value="ID">{t('finance.ID')}</option>
                {can('rentals.read') && (
                  <>
                    <option value="UTILIZATION">
                      {t('finance.UTILIZATION')}
                    </option>
                    <option value="UNRENTED_TIME">
                      {t('finance.UNRENTED_TIME')}
                    </option>
                  </>
                )}
                {can('rentals.pricing.view') && (
                  <option value="COMPLETED_VALUE">
                    {t('finance.COMPLETED_VALUE')}
                  </option>
                )}
              </select>
            </label>
            {sort === 'COMPLETED_VALUE' && (
              <label>
                {t('finance.sortCurrency')}
                <select
                  value={sortCurrency}
                  required
                  onChange={(e) => SortCurrency(e.target.value)}
                >
                  <option value="">{t('finance.currency')}</option>
                  {report?.summary.values.map((v) => (
                    <option key={v.currency} value={v.currency}>
                      {v.currency}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(machineId || customerId) && (
              <button
                type="button"
                onClick={() => {
                  M('');
                  C('');
                  const q = new URLSearchParams(query);
                  q.delete('machineId');
                  q.delete('customerId');
                  changeQuery(q);
                }}
              >
                {t('finance.clear')}
              </button>
            )}
          </form>
        </>
      )}
      {busy && <p role="status">{t('finance.loading')}</p>}
      {report && (
        <>
          <p>
            {timestamp(report.period.from)} — {timestamp(report.period.to)} (
            {report.timezone})
          </p>
          <p>{t('finance.periodNote')}</p>
          {report.visibility.export && (
            <a
              href={client.exportUrl(
                org,
                new URLSearchParams({ ...Object.fromEntries(query), locale }),
              )}
            >
              {t('finance.export')}
            </a>
          )}
          <section
            aria-label={t('finance.current')}
            className="finance-summary"
          >
            {(['machineCount', 'activeRentals'] as const).map((k) => (
              <article className="finance-card" key={k}>
                <h3>{t(`finance.${k}`)}</h3>
                <p>{report.summary[k]}</p>
              </article>
            ))}
            {(['machinesRented', 'machinesUnderMaintenance'] as const).map(
              (k) => (
                <article className="finance-card" key={k}>
                  <h3>{t(`finance.${k}`)}</h3>
                  <p>{report[k]}</p>
                </article>
              ),
            )}
            <article className="finance-card">
              <Performance
                row={report.summary}
                locale={locale}
                timezone={report.timezone}
              />
            </article>
          </section>
          {report.unavailableEstimates !== undefined &&
            report.unavailableEstimates > 0 && (
              <p>
                {t('finance.unavailable')}: {report.unavailableEstimates}
              </p>
            )}
          {!!report.unallocatedValues?.length && (
            <details>
              <summary>{t('finance.unallocated')}</summary>
              <MoneyValues values={report.unallocatedValues} locale={locale} />
            </details>
          )}
          <h2>{t('finance.trends')}</h2>
          {report.visibility.pricing && (
            <label>
              {t('finance.currency')}
              <select
                value={currency}
                onChange={(e) => Currency(e.target.value)}
              >
                <option value="">{t('finance.utilization')}</option>
                {report.summary.values.map((v) => (
                  <option key={v.currency} value={v.currency}>
                    {v.currency}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Trend
            report={report}
            locale={locale}
            currency={report.visibility.pricing ? currency : ''}
          />
          <div className="finance-table">
            <table>
              <thead>
                <tr>
                  <th>{t('finance.name')}</th>
                  <th>{t('finance.title')}</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.label === 'UNASSIGNED'
                        ? t('finance.unknown')
                        : row.label}
                      {query.get('group') === 'machine' && (
                        <Link
                          href={`/machines/${row.id}?organizationId=${org}`}
                        >
                          {' '}
                          · {t('finance.machine')}
                        </Link>
                      )}
                    </td>
                    <td>
                      <Performance
                        row={row}
                        locale={locale}
                        timezone={report.timezone}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.items.length && <p>{t('finance.empty')}</p>}
          <button
            disabled={busy || !cursors.length}
            onClick={() => {
              const next = cursors.slice(0, -1),
                q = new URLSearchParams(query);
              if (next.at(-1)) q.set('cursor', next.at(-1)!);
              else q.delete('cursor');
              Cursors(next);
              changeQuery(q);
            }}
          >
            {t('finance.previous')}
          </button>{' '}
          <button
            disabled={busy || !report.nextCursor}
            onClick={() => {
              const q = new URLSearchParams(query);
              q.set('cursor', report.nextCursor!);
              Cursors([...cursors, report.nextCursor!]);
              changeQuery(q);
            }}
          >
            {t('finance.next')}
          </button>
          <p>{t('finance.scopeNote')}</p>
        </>
      )}
    </main>
  );
}
