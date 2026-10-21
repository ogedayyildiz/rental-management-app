'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createMachineClient, MachineApiError } from '@rental/api-client';
import {
  machineAccessSchema,
  machineServiceStateSchema,
  machineRentalStateSchema,
  machineLifecycleStateSchema,
  machineRestoreSchema,
} from '@rental/validation';
import type { MachineView, MachinePage } from '@rental/validation';
import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
import {
  MachineForm,
  measurementFields,
  specificationTextFields,
} from './machine-form';
const api = createMachineClient('/api/backend');
type Organization = {
  name: string;
  access: {
    organizationId: string;
    permissions: string[];
    branchScope: 'ALL_BRANCHES' | 'SELECTED_BRANCHES';
  } | null;
};
export function MachineWorkspace({
  initialId,
  initialOrg,
}: {
  initialId?: string;
  initialOrg?: string;
}) {
  const [locale, setLocale] = useState<Locale>('en'),
    [orgs, setOrgs] = useState<Organization[]>([]),
    [org, setOrg] = useState(''),
    [page, setPage] = useState<MachinePage>({ items: [], nextCursor: null }),
    [branches, setBranches] = useState<{ id: string; name: string }[]>([]),
    [detail, setDetail] = useState<MachineView | null>(null),
    [form, setForm] = useState(false),
    [busy, setBusy] = useState(true),
    [error, setError] = useState<TranslationKey | null>(null),
    [restoreReason, setRestoreReason] = useState('INCORRECT_SALE'),
    [query, setQuery] = useState(''),
    [cursors, setCursors] = useState<string[]>([]);
  const epoch = useRef(0),
    t = (k: TranslationKey) => translate(locale, k),
    access = orgs.find((o) => o.access?.organizationId === org)?.access,
    can = (p: string) => access?.permissions.includes(p) ?? false;
  const fail = useCallback((e: unknown) => {
    setError(
      e instanceof MachineApiError && e.code === 'MACHINE_COMMITTED'
        ? 'machines.committed'
        : e instanceof MachineApiError && e.code === 'MACHINE_ARCHIVED'
          ? 'machines.archivedEdit'
          : e instanceof MachineApiError &&
              e.code === 'MACHINE_COMMITMENT_CONFLICT'
            ? 'machines.commitmentConflict'
            : e instanceof MachineApiError && e.status === 409
              ? 'machines.conflict'
              : 'machines.error',
    );
  }, []);
  const load = useCallback(
    async (id: string, search: string, cursor?: string) => {
      const version = ++epoch.current;
      setBusy(true);
      setError(null);
      setPage({ items: [], nextCursor: null });
      setBranches([]);
      try {
        const params = new URLSearchParams(search);
        if (cursor) params.set('cursor', cursor);
        const [next, choices] = await Promise.all([
          api.list(id, params),
          api.branches(id),
        ]);
        if (version === epoch.current) {
          setPage(next);
          setBranches(choices);
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
    const requestEpoch = epoch;
    let alive = true;
    void (async () => {
      try {
        const response = await fetch('/api/backend/me', { cache: 'no-store' });
        if (!response.ok) throw new Error();
        const me = machineAccessSchema.parse(await response.json());
        if (!alive) return;
        const choices = me.organizations.filter((o) =>
          o.access?.permissions.includes('machines.read'),
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
            const row = await api.get(id, initialId);
            if (alive) setDetail(row);
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
      const row = detail
        ? await api.update(org, detail.id, value)
        : await api.create(org, value);
      setDetail(row);
      setForm(false);
      setCursors([]);
      await load(org, query);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function archive(state: 'SOLD' | 'RETIRED') {
    if (!detail || !window.confirm(t('machines.confirm'))) return;
    setBusy(true);
    setError(null);
    try {
      setDetail(await api.archive(org, detail.id, state));
      setCursors([]);
      await load(org, query);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!detail || !window.confirm(t('machines.restoreConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      setDetail(
        await api.restore(org, detail.id, { reasonCode: restoreReason }),
      );
      setCursors([]);
      await load(org, query);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="machine-workspace">
      <header>
        <div>
          <Link href="/">{t('app.title')}</Link>
          <h1>{t('machines.title')}</h1>
          <p>{t('machines.subtitle')}</p>
        </div>
        <label>
          {t('customers.language')}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value === 'tr' ? 'tr' : 'en')}
          >
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </label>
      </header>
      {error && (
        <p role="alert" className="machine-error">
          {t(error)}
        </p>
      )}
      {busy && <p role="status">{t('machines.loading')}</p>}
      {!org && !busy ? (
        <p>
          {t('machines.noAccess')} <a href="/auth/login">{t('auth.login')}</a>
        </p>
      ) : (
        org && (
          <>
            <div className="machine-actions">
              <label>
                {t('customers.organization')}
                <select
                  value={org}
                  disabled={busy}
                  onChange={(e) => {
                    setOrg(e.target.value);
                    setDetail(null);
                    setForm(false);
                    setQuery('');
                    setCursors([]);
                    void load(e.target.value, '');
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
              </label>
              {can('machines.create') && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setDetail(null);
                    setForm(true);
                  }}
                >
                  {t('machines.create')}
                </button>
              )}
            </div>
            {form ? (
              <MachineForm
                key={detail?.id ?? 'new'}
                row={detail}
                branches={branches}
                locale={locale}
                busy={busy}
                allBranches={access?.branchScope === 'ALL_BRANCHES'}
                canEditCost={
                  can('finance.acquisition_cost.edit') &&
                  can('finance.acquisition_cost.view')
                }
                canViewCost={can('finance.acquisition_cost.view')}
                onSave={save}
                onCancel={() => setForm(false)}
              />
            ) : detail ? (
              <section className="machine-panel">
                <div className="machine-actions">
                  <Link href="/machines">{t('machines.back')}</Link>
                  {detail.lifecycleState !== 'ACTIVE' &&
                    can('machines.archive') && (
                      <>
                        <label>
                          {t('machines.restoreReason')}
                          <select
                            value={restoreReason}
                            disabled={busy}
                            onChange={(e) => setRestoreReason(e.target.value)}
                          >
                            {machineRestoreSchema.shape.reasonCode.options.map(
                              (reason) => (
                                <option key={reason} value={reason}>
                                  {t(`machines.${reason}`)}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <button disabled={busy} onClick={() => void restore()}>
                          {t('machines.restore')}
                        </button>
                      </>
                    )}
                  {detail.lifecycleState === 'ACTIVE' &&
                    can('machines.update') && (
                      <button disabled={busy} onClick={() => setForm(true)}>
                        {t('machines.edit')}
                      </button>
                    )}
                  {detail.lifecycleState === 'ACTIVE' &&
                    can('machines.archive') && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => void archive('RETIRED')}
                        >
                          {t('machines.retire')}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => void archive('SOLD')}
                        >
                          {t('machines.sell')}
                        </button>
                      </>
                    )}
                </div>
                <h2>
                  {detail.fleetNumber} · {detail.manufacturer} {detail.model}
                </h2>
                <dl className="machine-grid">
                  {(
                    [
                      'category',
                      'serialNumber',
                      'modelYear',
                      'acquisitionDate',
                      'notes',
                    ] as const
                  ).map((k) => (
                    <div key={k}>
                      <dt>{t(`machines.${k}`)}</dt>
                      <dd>{detail[k] ?? '—'}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>{t('machines.branchId')}</dt>
                    <dd>{detail.branchName ?? t('machines.none')}</dd>
                  </div>
                  {(
                    ['rentalState', 'serviceState', 'lifecycleState'] as const
                  ).map((k) => (
                    <div key={k}>
                      <dt>{t(`machines.${k}`)}</dt>
                      <dd>{t(`machines.${detail[k]}`)}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>{t('machines.ownershipType')}</dt>
                    <dd>
                      {detail.ownershipType
                        ? t(`machines.${detail.ownershipType}`)
                        : '—'}
                    </dd>
                  </div>
                  {detail.acquisitionCost !== undefined && (
                    <div>
                      <dt>{t('machines.acquisitionCost')}</dt>
                      <dd>
                        {detail.acquisitionCost ?? '—'} {detail.currency}
                      </dd>
                    </div>
                  )}
                </dl>
                <p>{t('machines.readonly')}</p>
                <h3>{t('machines.specs')}</h3>
                <dl className="machine-grid">
                  {[...measurementFields, ...specificationTextFields]
                    .filter((k) => detail.specifications[k] !== undefined)
                    .map((k) => (
                      <div key={k}>
                        <dt>{t(`machines.${k}`)}</dt>
                        <dd>{detail.specifications[k]}</dd>
                      </div>
                    ))}
                </dl>
              </section>
            ) : (
              <>
                <form
                  className="machine-panel"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const params = new URLSearchParams();
                    for (const [key, value] of new FormData(e.currentTarget)) {
                      if (typeof value === 'string' && value.trim())
                        params.set(key, value.trim());
                    }
                    setQuery(params.toString());
                    setCursors([]);
                    void load(org, params.toString());
                  }}
                >
                  <fieldset disabled={busy}>
                    <div className="machine-grid">
                      <label>
                        {t('machines.search')}
                        <input name="q" maxLength={200} />
                      </label>
                      {(
                        [
                          'fleetNumber',
                          'manufacturer',
                          'model',
                          'serialNumber',
                          'category',
                        ] as const
                      ).map((k) => (
                        <label key={k}>
                          {t(`machines.${k}`)}
                          <input
                            name={k}
                            maxLength={k === 'fleetNumber' ? 100 : 200}
                          />
                        </label>
                      ))}
                      <label>
                        {t('machines.branchId')}
                        <select name="branchId">
                          <option value="">{t('machines.all')}</option>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t('machines.lifecycleState')}
                        <select name="lifecycleState">
                          <option value="ACTIVE">{t('machines.ACTIVE')}</option>
                          <option value="ALL">{t('machines.all')}</option>
                          {machineLifecycleStateSchema.options
                            .filter((s) => s !== 'ACTIVE')
                            .map((s) => (
                              <option key={s} value={s}>
                                {t(`machines.${s}`)}
                              </option>
                            ))}
                        </select>
                      </label>
                      {(['rentalState', 'serviceState'] as const).map((k) => (
                        <label key={k}>
                          {t(`machines.${k}`)}
                          <select name={k}>
                            <option value="">{t('machines.all')}</option>
                            {(k === 'rentalState'
                              ? machineRentalStateSchema.options
                              : machineServiceStateSchema.options
                            ).map((s) => (
                              <option key={s} value={s}>
                                {t(`machines.${s}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <button type="submit">{t('machines.filter')}</button>
                  </fieldset>
                </form>
                <div className="machine-table">
                  <table>
                    <thead>
                      <tr>
                        {(
                          [
                            'fleetNumber',
                            'manufacturer',
                            'model',
                            'category',
                            'serialNumber',
                            'branchId',
                            'rentalState',
                            'serviceState',
                            'lifecycleState',
                          ] as const
                        ).map((k) => (
                          <th key={k}>{t(`machines.${k}`)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {page.items.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <Link
                              href={`/machines/${row.id}?organizationId=${org}`}
                            >
                              {row.fleetNumber}
                            </Link>
                          </td>
                          <td>{row.manufacturer}</td>
                          <td>{row.model}</td>
                          <td>{row.category}</td>
                          <td>{row.serialNumber ?? '—'}</td>
                          <td>{row.branchName ?? t('machines.none')}</td>
                          <td>{t(`machines.${row.rentalState}`)}</td>
                          <td>{t(`machines.${row.serviceState}`)}</td>
                          <td>{t(`machines.${row.lifecycleState}`)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!busy && !page.items.length && <p>{t('machines.empty')}</p>}
                <div className="machine-actions">
                  <button
                    disabled={busy || !cursors.length}
                    onClick={() => {
                      const next = cursors.slice(0, -1);
                      setCursors(next);
                      void load(org, query, next.at(-1));
                    }}
                  >
                    {t('machines.previous')}
                  </button>
                  <button
                    disabled={busy || !page.nextCursor}
                    onClick={() => {
                      if (page.nextCursor) {
                        setCursors([...cursors, page.nextCursor]);
                        void load(org, query, page.nextCursor);
                      }
                    }}
                  >
                    {t('machines.next')}
                  </button>
                </div>
              </>
            )}
          </>
        )
      )}
    </main>
  );
}
