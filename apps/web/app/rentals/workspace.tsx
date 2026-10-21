'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createRentalClient, RentalApiError } from '@rental/api-client';
import type { RentalAction } from '@rental/api-client';
import { machineAccessSchema, rentalStatusSchema } from '@rental/validation';
import type { RentalView, RentalCatalog } from '@rental/validation';
import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
import { RentalForm, fromUtc } from './rental-form';
import { RentalDetail } from './rental-detail';
const api = createRentalClient('/api/backend');
type Organization = {
  name: string;
  access: {
    organizationId: string;
    permissions: string[];
    branchScope: 'ALL_BRANCHES' | 'SELECTED_BRANCHES';
  } | null;
};
export function RentalWorkspace({
  initialId,
  initialOrg,
}: {
  initialId?: string;
  initialOrg?: string;
}) {
  const [locale, setLocale] = useState<Locale>('en'),
    [orgs, setOrgs] = useState<Organization[]>([]),
    [org, setOrg] = useState(''),
    [page, setPage] = useState<{
      items: RentalView[];
      nextCursor: string | null;
    }>({ items: [], nextCursor: null }),
    [catalog, setCatalog] = useState<RentalCatalog>({
      categories: [],
      models: [],
      branches: [],
      timezone: 'UTC',
    }),
    [row, setRow] = useState<RentalView | null>(null),
    [form, setForm] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState<TranslationKey | null>(null),
    [query, setQuery] = useState(''),
    [cursors, setCursors] = useState<string[]>([]);
  const epoch = useRef(0),
    t = (k: TranslationKey) => translate(locale, k),
    can = (p: string) =>
      orgs
        .find((o) => o.access?.organizationId === org)
        ?.access?.permissions.includes(p) ?? false;
  const fail = useCallback(
    (e: unknown) =>
      setError(
        e instanceof RentalApiError
          ? e.code === 'MACHINE_INELIGIBLE'
            ? 'rentals.ineligible'
            : e.code === 'INVALID_TRANSITION'
              ? 'rentals.transition'
              : e.status === 409
                ? 'rentals.conflict'
                : e.status === 400
                  ? 'rentals.invalid'
                  : 'rentals.error'
          : 'rentals.error',
      ),
    [],
  );
  const load = useCallback(
    async (id: string, search: string, cursor?: string) => {
      const version = ++epoch.current;
      setBusy(true);
      setError(null);
      try {
        const q = new URLSearchParams(search);
        if (cursor) q.set('cursor', cursor);
        const next = await api.list(id, q);
        const choices = await api.catalog(id);
        if (version === epoch.current) {
          setPage(next);
          setCatalog(choices);
        }
      } catch (e) {
        if (version === epoch.current) fail(e);
      } finally {
        if (version === epoch.current) setBusy(false);
      }
    },
    [fail],
  );
  useEffect(() => {
    let alive = true;
    const requestEpoch = epoch;
    void (async () => {
      try {
        const response = await fetch('/api/backend/me', { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const me = machineAccessSchema.parse(await response.json());
        if (!alive) return;
        const choices = me.organizations.filter((o) =>
          o.access?.permissions.includes('rentals.read'),
        );
        setOrgs(choices);
        const selected =
          choices.find((o) => o.access?.organizationId === initialOrg) ??
          choices[0];
        if (selected?.access) {
          const id = selected.access.organizationId;
          setOrg(id);
          await load(id, '');
          if (initialId && id === initialOrg) {
            const rental = await api.get(id, initialId);
            if (alive) setRow(rental);
          }
        }
      } catch (e) {
        if (alive) fail(e);
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
      requestEpoch.current++;
    };
  }, [initialId, initialOrg, load, fail]);
  async function save(value: unknown) {
    setBusy(true);
    setError(null);
    try {
      const result = row
        ? await api.update(org, row.id, value)
        : await api.create(org, value);
      setRow(result);
      setForm(false);
      setCursors([]);
      await load(org, query);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: RentalAction, body?: unknown) {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.action(org, row.id, action, body);
      setRow(result);
      await load(org, query);
    } catch (e) {
      fail(e);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const offeredModels = (rental: RentalView) =>
    rental.items
      .filter((item) => !item.removedAt)
      .map((item) => {
        const requested = catalog.models.find(
          (model) => model.id === item.requestedModelId,
        );
        const assigned = [
          ...new Set(
            item.assignments
              .filter((a) => !a.releasedAt)
              .map((a) => `${a.manufacturer} ${a.model}`),
          ),
        ];
        const category = catalog.categories.find(
          (c) => c.id === item.requestedCategoryId,
        );
        const label = requested
          ? `${requested.manufacturer} ${requested.name}`
          : assigned.length
            ? assigned.join(', ')
            : category
              ? `${category.name} — ${t('rentals.modelUnspecified')}`
              : t('rentals.modelUnspecified');
        const assignments = item.assignments.filter((a) => !a.releasedAt);
        return {
          id: item.id,
          label,
          quantity: item.quantity,
          assignments,
          unassigned: Math.max(0, item.quantity - assignments.length),
        };
      });
  const date = (v: string | null, zone: string) =>
    v
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: zone,
        }).format(new Date(v))
      : '—';
  return (
    <main className="rental-workspace">
      <header>
        <h1>{t('rentals.title')}</h1>
        <nav>
          <Link href="/">{t('app.title')}</Link> ·{' '}
          <Link href="/customers">{t('customers.title')}</Link> ·{' '}
          <Link href="/machines">{t('machines.title')}</Link>
        </nav>
        <select
          aria-label={t('customers.language')}
          value={locale}
          onChange={(e) => setLocale(e.target.value === 'tr' ? 'tr' : 'en')}
        >
          <option value="en">English</option>
          <option value="tr">Türkçe</option>
        </select>
      </header>
      {error && (
        <p className="rental-error" role="alert">
          {t(error)}
        </p>
      )}
      {!busy && !org && <p>{t('rentals.noAccess')}</p>}
      {org && (
        <>
          <div className="rental-actions">
            <select
              aria-label={t('customers.organization')}
              disabled={busy}
              value={org}
              onChange={(e) => {
                const id = e.target.value;
                setOrg(id);
                setRow(null);
                setForm(false);
                setPage({ items: [], nextCursor: null });
                setCatalog({
                  categories: [],
                  models: [],
                  branches: [],
                  timezone: 'UTC',
                });
                setQuery('');
                setCursors([]);
                void load(id, '');
              }}
            >
              {orgs.map((o) => (
                <option
                  key={o.access?.organizationId}
                  value={o.access?.organizationId}
                >
                  {o.name}
                </option>
              ))}
            </select>
            {can('rentals.create') && (
              <button
                disabled={busy}
                onClick={() => {
                  setRow(null);
                  setForm(true);
                }}
              >
                {t('rentals.new')}
              </button>
            )}
          </div>
          <form
            key={org}
            className="rental-panel"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget),
                q = new URLSearchParams();
              for (const [key, value] of data) {
                if (typeof value === 'string' && value)
                  q.set(
                    key,
                    [
                      'plannedFrom',
                      'plannedTo',
                      'actualFrom',
                      'actualTo',
                    ].includes(key)
                      ? fromUtc(value)!
                      : value,
                  );
              }
              setQuery(q.toString());
              setCursors([]);
              void load(org, q.toString());
            }}
          >
            <fieldset disabled={busy}>
              <div className="rental-grid">
                <label>
                  {t('rentals.search')}
                  <input name="q" />
                </label>
                <label>
                  {t('rentals.state')}
                  <select name="status">
                    <option value="">{t('rentals.all')}</option>
                    {rentalStatusSchema.options.map((s) => (
                      <option key={s} value={s}>
                        {t(`rentals.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('rentals.branch')}
                  <select name="branchId">
                    <option value="">{t('rentals.all')}</option>
                    {catalog.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('rentals.from')}
                  <input type="datetime-local" name="plannedFrom" />
                </label>
                <label>
                  {t('rentals.to')}
                  <input type="datetime-local" name="plannedTo" />
                </label>
                <label>
                  {t('rentals.actualFrom')}
                  <input type="datetime-local" name="actualFrom" />
                </label>
                <label>
                  {t('rentals.actualTo')}
                  <input type="datetime-local" name="actualTo" />
                </label>
                <label className="rental-check">
                  <input type="checkbox" name="current" value="true" />
                  {t('rentals.current')}
                </label>
              </div>
              <button>{t('rentals.search')}</button>
            </fieldset>
          </form>
          {form && (
            <RentalForm
              key={`${org}:${row?.id ?? 'new'}`}
              org={org}
              catalog={catalog}
              locale={locale}
              row={row}
              canCreateCustomer={can('customers.create')}
              canPrice={can('rentals.pricing.edit')}
              canViewPrice={can('rentals.pricing.view')}
              busy={busy}
              onSave={save}
              onClose={() => setForm(false)}
            />
          )}
          {row && !form && (
            <>
              <button disabled={busy} onClick={() => setRow(null)}>
                {t('rentals.close')}
              </button>
              <RentalDetail
                key={`${row.id}:${row.updatedAt}`}
                row={row}
                catalog={catalog}
                locale={locale}
                can={can}
                busy={busy}
                act={async (a, b) => {
                  try {
                    await act(a, b);
                  } catch {
                    /* Error is rendered by the workspace; retain detail for correction. */
                  }
                }}
                edit={() => setForm(true)}
                fail={fail}
              />
            </>
          )}
          <div className="rental-table">
            <table>
              <thead>
                <tr>
                  {(
                    [
                      'rentals.number',
                      'rentals.customer',
                      'rentals.offeredModels',
                      'rentals.state',
                      'rentals.branch',
                      'rentals.planned',
                      'rentals.actual',
                      'rentals.machines',
                    ] as const
                  ).map((k) => (
                    <th key={k}>{t(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/rentals/${r.id}?organizationId=${org}`}>
                        {r.number}
                      </Link>
                    </td>
                    <td>{r.customerName}</td>
                    <td>
                      {offeredModels(r).map((item) => (
                        <div key={item.id}>
                          {item.quantity} × {item.label}
                          {item.assignments.map((assignment) => (
                            <small key={assignment.id}>
                              {assignment.fleetNumber}
                            </small>
                          ))}
                          {item.unassigned > 0 && (
                            <small>
                              {t('rentals.awaitingAssignment')}:{' '}
                              {item.unassigned}
                            </small>
                          )}
                        </div>
                      ))}
                      {!r.items.some((item) => !item.removedAt) && '—'}
                    </td>
                    <td>{t(`rentals.${r.status}`)}</td>
                    <td>{r.branchName ?? t('rentals.unassigned')}</td>
                    <td>
                      {date(r.plannedStartAt, r.timezone)} —{' '}
                      {date(r.plannedEndAt, r.timezone)}
                    </td>
                    <td>
                      {date(r.actualStartAt, r.timezone)} —{' '}
                      {date(r.actualEndAt, r.timezone)}
                    </td>
                    <td>
                      {r.items
                        .filter((i) => !i.removedAt)
                        .reduce((n, i) => n + i.quantity, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!busy && !page.items.length && <p>{t('rentals.empty')}</p>}
          <div className="rental-actions">
            <button
              disabled={busy || !cursors.length}
              onClick={() => {
                const next = cursors.slice(0, -1);
                setCursors(next);
                void load(org, query, next.at(-1));
              }}
            >
              {t('rentals.previous')}
            </button>
            <button
              disabled={busy || !page.nextCursor}
              onClick={() => {
                if (page.nextCursor) {
                  setCursors((v) => [...v, page.nextCursor!]);
                  void load(org, query, page.nextCursor);
                }
              }}
            >
              {t('rentals.next')}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
