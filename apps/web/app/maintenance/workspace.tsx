'use client';
import { useEffect, useState } from 'react';
import { MaintenancePlans } from './plans';
import type { FormEvent } from 'react';
import Link from 'next/link';
import {
  createMaintenanceClient,
  createMachineClient,
} from '@rental/api-client';
import {
  machineAccessSchema,
  workOrderCreateSchema,
  workOrderPatchSchema,
  workOrderStatusSchema,
  maintenanceTypeSchema,
  maintenancePrioritySchema,
  maintenanceImpactSchema,
  machineServiceStateSchema,
} from '@rental/validation';
import type { WorkOrderView, MachineView } from '@rental/validation';
import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
const api = createMaintenanceClient('/api/backend'),
  machinesApi = createMachineClient('/api/backend');
type Org = {
  name: string;
  access: {
    organizationId: string;
    permissions: string[];
    branchScope: 'ALL_BRANCHES' | 'SELECTED_BRANCHES';
  } | null;
};
const utc = (s: FormDataEntryValue | null) =>
  s ? new Date(String(s) + 'Z').toISOString() : null;
export function MaintenanceWorkspace({
  initialId,
  initialOrg,
  initialMachine,
}: {
  initialId?: string;
  initialOrg?: string;
  initialMachine?: string;
}) {
  const [locale, setLocale] = useState<Locale>('en'),
    [orgs, setOrgs] = useState<Org[]>([]),
    [org, setOrg] = useState(''),
    [rows, setRows] = useState<WorkOrderView[]>([]),
    [next, setNext] = useState<string | null>(null),
    [row, setRow] = useState<WorkOrderView | null>(null),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [machines, setMachines] = useState<MachineView[]>([]),
    [branches, setBranches] = useState<{ id: string; name: string }[]>([]),
    [machineSearch, setMachineSearch] = useState(''),
    [query, setQuery] = useState(''),
    [blocks, setBlocks] = useState<Awaited<ReturnType<typeof api.blocks>>>([]);
  const t = (k: TranslationKey) => translate(locale, k),
    can = (p: string) =>
      orgs
        .find((x) => x.access?.organizationId === org)
        ?.access?.permissions.includes(p) ?? false;
  async function load(o: string, q: string, cursor?: string) {
    const search = new URLSearchParams(q);
    if (cursor) search.set('cursor', cursor);
    const page = await api.list(o, search);
    setRows(page.items);
    setNext(page.nextCursor);
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(false);
    try {
      await work();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch('/api/backend/me', { cache: 'no-store' });
        if (!response.ok) throw Error();
        const me = machineAccessSchema.parse(await response.json());
        if (!alive) return;
        const choices = me.organizations.filter((x) =>
          x.access?.permissions.includes('maintenance.read'),
        );
        setOrgs(choices);
        const selected =
          choices.find((x) => x.access?.organizationId === initialOrg) ??
          choices[0];
        if (selected?.access) {
          const id = selected.access.organizationId;
          setOrg(id);
          const filter = initialMachine
            ? 'machineId=' + encodeURIComponent(initialMachine)
            : '';
          setQuery(filter);
          await load(id, filter);
          if (initialId && id === initialOrg) {
            const detail = await api.get(id, initialId);
            const restrictions = await api.blocks(id, detail.machineId);
            if (alive) {
              setRow(detail);
              setBlocks(restrictions);
            }
          }
        }
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialId, initialOrg, initialMachine]);
  async function select(value: WorkOrderView) {
    setRow(value);
    setEditing(false);
    setBlocks(await api.blocks(org, value.machineId));
  }
  async function action(
    name: 'open' | 'schedule' | 'start' | 'complete' | 'cancel',
    notes: string,
  ) {
    if (!row) return;
    await select(
      await api.action(org, row.id, name, {
        notes: notes || undefined,
        reason: notes || undefined,
      }),
    );
    await load(org, query);
  }
  const date = (value: string | null, zone = 'UTC') =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: zone,
        }).format(new Date(value))
      : '—';
  const options = (values: readonly string[]) =>
    values.map((v) => (
      <option key={v} value={v}>
        {t(('maintenance.' + v) as TranslationKey)}
      </option>
    ));
  async function prepare(edit: boolean) {
    setEditing(true);
    if (!edit) setRow(null);
    setBranches(await machinesApi.branches(org));
    setMachines(
      (
        await machinesApi.list(
          org,
          new URLSearchParams({ limit: '100', lifecycleState: 'ACTIVE' }),
        )
      ).items,
    );
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      const data = {
        type: f.get('type'),
        title: f.get('title'),
        description: f.get('description') || null,
        priority: f.get('priority'),
        impact: f.get('impact'),
        branchId: f.get('branchId') || null,
        plannedAt: utc(f.get('plannedAt')),
        plannedEndAt: utc(f.get('plannedEndAt')),
        dueAt: utc(f.get('dueAt')),
        technicianNotes: f.get('technicianNotes') || null,
        diagnosis: f.get('diagnosis') || null,
        externalProvider: f.get('externalProvider') || null,
        serviceLocation: f.get('serviceLocation') || null,
      };
      const result = row
        ? await api.update(org, row.id, workOrderPatchSchema.parse(data))
        : await api.create(
            org,
            workOrderCreateSchema.parse({
              ...data,
              machineId: f.get('machineId'),
              checklist: String(f.get('checklist') || '')
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            }),
          );
      await select(result);
      await load(org, query);
    });
  }
  return (
    <main className="rental-workspace">
      <header>
        <h1>{t('maintenance.title')}</h1>
        <nav>
          <Link href="/">{t('app.title')}</Link> ·{' '}
          <Link href="/machines">{t('machines.title')}</Link> ·{' '}
          <Link href="/rentals">{t('rentals.title')}</Link>
        </nav>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value === 'tr' ? 'tr' : 'en')}
          aria-label={t('customers.language')}
        >
          <option value="en">English</option>
          <option value="tr">Türkçe</option>
        </select>
      </header>
      {error && (
        <p role="alert" className="rental-error">
          {t('maintenance.error')}
        </p>
      )}
      <fieldset disabled={busy}>
        <select
          value={org}
          aria-label={t('customers.organization')}
          onChange={(e) => {
            const id = e.target.value;
            setOrg(id);
            setRow(null);
            setEditing(false);
            void run(() => load(id, ''));
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
        {org && (
          <>
            <div className="rental-actions">
              {can('maintenance.create') && (
                <button onClick={() => void run(() => prepare(false))}>
                  {t('maintenance.new')}
                </button>
              )}
            </div>
            <form
              className="rental-panel rental-grid"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  q = new URLSearchParams();
                for (const [k, v] of f) if (v) q.set(k, String(v));
                setQuery(q.toString());
                void run(() => load(org, q.toString()));
              }}
            >
              <label>
                {t('rentals.search')}
                <input name="q" />
              </label>
              <label>
                {t('rentals.state')}
                <select name="status">
                  <option value="">{t('rentals.all')}</option>
                  {options(workOrderStatusSchema.options)}
                </select>
              </label>
              <label>
                {t('maintenance.type')}
                <select name="type">
                  <option value="">{t('rentals.all')}</option>
                  {options(maintenanceTypeSchema.options)}
                </select>
              </label>
              <label>
                {t('maintenance.priority')}
                <select name="priority">
                  <option value="">{t('rentals.all')}</option>
                  {options(maintenancePrioritySchema.options)}
                </select>
              </label>
              <label>
                <input type="checkbox" name="overdue" value="true" />
                {t('maintenance.overdue')}
              </label>
              <label>
                <input type="checkbox" name="open" value="true" />
                {t('maintenance.activeOnly')}
              </label>
              <button>{t('rentals.search')}</button>
            </form>
            {editing && (
              <form
                className="rental-panel"
                key={row?.id ?? 'new'}
                onSubmit={save}
              >
                <h2>{t(row ? 'rentals.edit' : 'maintenance.new')}</h2>
                <div className="rental-grid">
                  {!row && (
                    <>
                      <label>
                        {t('rentals.search')}
                        <input
                          value={machineSearch}
                          onChange={(e) => setMachineSearch(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          void run(async () =>
                            setMachines(
                              (
                                await machinesApi.list(
                                  org,
                                  new URLSearchParams({
                                    q: machineSearch,
                                    limit: '100',
                                    lifecycleState: 'ACTIVE',
                                  }),
                                )
                              ).items,
                            ),
                          )
                        }
                      >
                        {t('rentals.search')}
                      </button>
                      <label>
                        {t('rentals.machines')}
                        <select name="machineId" required>
                          <option value="">{t('rentals.choose')}</option>
                          {machines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.fleetNumber} · {m.manufacturer} {m.model}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  <label>
                    {t('maintenance.title')}
                    <input name="title" required defaultValue={row?.title} />
                  </label>
                  {(['type', 'priority', 'impact'] as const).map((k) => (
                    <label key={k}>
                      {t(('maintenance.' + k) as TranslationKey)}
                      <select
                        name={k}
                        defaultValue={
                          row?.[k] ??
                          {
                            type: 'PREVENTIVE',
                            priority: 'NORMAL',
                            impact: 'WARNING',
                          }[k]
                        }
                      >
                        {options(
                          k === 'type'
                            ? maintenanceTypeSchema.options
                            : k === 'priority'
                              ? maintenancePrioritySchema.options
                              : maintenanceImpactSchema.options,
                        )}
                      </select>
                    </label>
                  ))}
                  <label>
                    {t('rentals.branch')}
                    <select name="branchId" defaultValue={row?.branchId ?? ''}>
                      <option value="">{t('rentals.unassigned')}</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(['plannedAt', 'plannedEndAt', 'dueAt'] as const).map(
                    (k) => (
                      <label key={k}>
                        {t(('maintenance.' + k) as TranslationKey)}
                        <input
                          type="datetime-local"
                          name={k}
                          defaultValue={row?.[k]?.slice(0, 16) ?? ''}
                        />
                      </label>
                    ),
                  )}
                  {(
                    [
                      'description',
                      'diagnosis',
                      'technicianNotes',
                      'externalProvider',
                      'serviceLocation',
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {t(
                        (k === 'description'
                          ? 'maintenance.complaint'
                          : 'maintenance.' + k) as TranslationKey,
                      )}
                      <textarea name={k} defaultValue={row?.[k] ?? ''} />
                    </label>
                  ))}
                  {!row && (
                    <label>
                      {t('maintenance.checklist')}
                      <textarea name="checklist" />
                    </label>
                  )}
                </div>
                <button>{t('customers.save')}</button>
                <button type="button" onClick={() => setEditing(false)}>
                  {t('rentals.close')}
                </button>
              </form>
            )}
            {row && !editing && (
              <section className="rental-panel">
                <h2>
                  {row.number} · {row.fleetNumber} · {row.title}
                </h2>
                <p>
                  {t(('maintenance.' + row.status) as TranslationKey)} ·{' '}
                  {t(('machines.' + row.serviceState) as TranslationKey)}
                </p>
                {can('maintenance.export') && (
                  <p>
                    {(['pdf', 'xlsx'] as const).map((format) => (
                      <a
                        key={format}
                        href={
                          '/api/backend/organizations/' +
                          org +
                          '/maintenance/machines/' +
                          row.machineId +
                          '/export/' +
                          format +
                          '?locale=' +
                          locale
                        }
                      >
                        {t(
                          format === 'pdf'
                            ? 'maintenance.exportPdf'
                            : 'maintenance.exportXlsx',
                        )}{' '}
                      </a>
                    ))}
                  </p>
                )}
                <p>{row.description}</p>
                <p>{row.diagnosis}</p>
                <p>{row.technicianNotes}</p>
                <p>{row.completionNotes}</p>
                <p>
                  {t('maintenance.plannedAt')}:{' '}
                  {date(row.plannedAt, row.timezone)} —{' '}
                  {date(row.plannedEndAt, row.timezone)}
                </p>
                <p>
                  {t('maintenance.dueAt')}: {date(row.dueAt, row.timezone)}{' '}
                  {row.overdue && t('maintenance.overdue')}
                </p>
                <p>
                  {t('maintenance.start')}: {date(row.startedAt, row.timezone)}{' '}
                  · {t('maintenance.complete')}:{' '}
                  {date(row.completedAt, row.timezone)}
                </p>
                {can('maintenance.update') &&
                  ['DRAFT', 'OPEN', 'PLANNED'].includes(row.status) && (
                    <button onClick={() => void run(() => prepare(true))}>
                      {t('rentals.edit')}
                    </button>
                  )}
                <form
                  className="rental-actions"
                  onSubmit={(e) => e.preventDefault()}
                >
                  <label>
                    {t('maintenance.notes')}
                    <textarea name="notes" id="maintenance-action-notes" />
                  </label>
                  {(
                    ['open', 'schedule', 'start', 'complete', 'cancel'] as const
                  )
                    .filter(
                      (a) =>
                        can('maintenance.' + (a === 'open' ? 'schedule' : a)) &&
                        (
                          {
                            open: ['DRAFT'],
                            schedule: ['OPEN'],
                            start: ['OPEN', 'PLANNED'],
                            complete: ['IN_PROGRESS'],
                            cancel: ['DRAFT', 'OPEN', 'PLANNED', 'IN_PROGRESS'],
                          }[a] as string[]
                        ).includes(row.status),
                    )
                    .map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={(e) => {
                          const form = e.currentTarget.form;
                          if (form)
                            void run(() =>
                              action(
                                a,
                                String(new FormData(form).get('notes') || ''),
                              ),
                            );
                        }}
                      >
                        {t(('maintenance.' + a) as TranslationKey)}
                      </button>
                    ))}
                </form>
                {row.tasks.map((task) => (
                  <label key={task.id} className="rental-check">
                    <input
                      type="checkbox"
                      checked={Boolean(task.completedAt)}
                      disabled={
                        !can('maintenance.update') ||
                        row.status !== 'IN_PROGRESS'
                      }
                      onChange={(e) => {
                        const completed = e.target.checked;
                        void run(async () =>
                          select(
                            await api.task(org, row.id, task.id, {
                              completed,
                              notes: task.notes,
                            }),
                          ),
                        );
                      }}
                    />
                    {task.description}
                  </label>
                ))}
                <h3>{t('maintenance.materials')}</h3>
                {row.materials.map((m) => (
                  <p key={m.id}>
                    {m.description} · {m.partNumber} · {m.quantity} {m.unit}
                  </p>
                ))}
                {can('maintenance.update') &&
                  !['COMPLETED', 'CANCELLED'].includes(row.status) && (
                    <form
                      className="rental-grid"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void run(async () =>
                          select(
                            await api.action(org, row.id, 'materials', {
                              description: f.get('description'),
                              partNumber: f.get('partNumber') || null,
                              quantity: f.get('quantity'),
                              unit: f.get('unit'),
                            }),
                          ),
                        );
                      }}
                    >
                      {['description', 'partNumber', 'quantity', 'unit'].map(
                        (k) => (
                          <label key={k}>
                            {t(
                              (k === 'description'
                                ? 'maintenance.materials'
                                : 'maintenance.' + k) as TranslationKey,
                            )}
                            <input name={k} required={k !== 'partNumber'} />
                          </label>
                        ),
                      )}
                      <button>{t('customers.save')}</button>
                    </form>
                  )}
                {row.costs && (
                  <>
                    <h3>{t('maintenance.costs')}</h3>
                    {row.costs.map((c) => (
                      <p key={c.id}>
                        {t(('maintenance.' + c.kind) as TranslationKey)} ·{' '}
                        {c.amount} {c.currency}
                      </p>
                    ))}
                  </>
                )}
                {can('maintenance.costs.edit') &&
                  !['COMPLETED', 'CANCELLED'].includes(row.status) && (
                    <form
                      className="rental-grid"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void run(async () =>
                          select(
                            await api.action(
                              org,
                              row.id,
                              'costs',
                              Object.fromEntries(f),
                            ),
                          ),
                        );
                      }}
                    >
                      <label>
                        {t('maintenance.kind')}
                        <select name="kind">
                          {options([
                            'LABOR',
                            'PARTS',
                            'EXTERNAL_SERVICE',
                            'TRANSPORT',
                            'OTHER',
                          ])}
                        </select>
                      </label>
                      <label>
                        {t('maintenance.amount')}
                        <input name="amount" required inputMode="decimal" />
                      </label>
                      <label>
                        {t('maintenance.currency')}
                        <input name="currency" required pattern="[A-Z]{3}" />
                      </label>
                      <button>{t('customers.save')}</button>
                    </form>
                  )}
                <h3>{t('maintenance.blocks')}</h3>
                {blocks.map((b) => (
                  <div key={b.id}>
                    {t(('machines.' + b.state) as TranslationKey)}
                    {!b.workOrderId && can('maintenance.release_machine') && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void run(async () => {
                            await api.release(org, row.machineId, b.id, {
                              reason: f.get('reason'),
                            });
                            await select(await api.get(org, row.id));
                          });
                        }}
                      >
                        <input
                          name="reason"
                          aria-label={t('maintenance.reason')}
                          required
                        />
                        <button>{t('maintenance.release')}</button>
                      </form>
                    )}
                  </div>
                ))}
                {can('maintenance.block_machine') && (
                  <form
                    className="rental-grid"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(async () => {
                        await api.block(
                          org,
                          row.machineId,
                          Object.fromEntries(f),
                        );
                        await select(await api.get(org, row.id));
                      });
                    }}
                  >
                    <label>
                      {t('machines.serviceState')}
                      <select name="state">
                        {machineServiceStateSchema.options
                          .filter((s) => s !== 'NORMAL')
                          .map((s) => (
                            <option key={s} value={s}>
                              {t(('machines.' + s) as TranslationKey)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      {t('maintenance.reason')}
                      <input name="reason" required />
                    </label>
                    <button>{t('maintenance.block')}</button>
                  </form>
                )}
              </section>
            )}
            <div className="rental-table">
              <table>
                <thead>
                  <tr>
                    {[
                      'number',
                      'title',
                      'type',
                      'priority',
                      'plannedAt',
                      'dueAt',
                    ].map((k) => (
                      <th key={k}>
                        {t(('maintenance.' + k) as TranslationKey)}
                      </th>
                    ))}
                    <th>{t('rentals.machines')}</th>
                    <th>{t('rentals.state')}</th>
                    <th>{t('rentals.branch')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link
                          href={
                            '/maintenance/' + r.id + '?organizationId=' + org
                          }
                          onClick={(e) => {
                            e.preventDefault();
                            void run(() => select(r));
                          }}
                        >
                          {r.number}
                        </Link>
                      </td>
                      <td>{r.title}</td>
                      <td>{t(('maintenance.' + r.type) as TranslationKey)}</td>
                      <td>
                        {t(('maintenance.' + r.priority) as TranslationKey)}
                      </td>
                      <td>{date(r.plannedAt, r.timezone)}</td>
                      <td>
                        {date(r.dueAt, r.timezone)}{' '}
                        {r.overdue && t('maintenance.overdue')}
                      </td>
                      <td>{r.fleetNumber}</td>
                      <td>
                        {t(('maintenance.' + r.status) as TranslationKey)}
                      </td>
                      <td>{r.branchName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              disabled={!next}
              onClick={() =>
                void run(() => load(org, query, next ?? undefined))
              }
            >
              {t('rentals.next')}
            </button>
            <button onClick={() => void run(() => load(org, query))}>
              {t('rentals.previous')}
            </button>
            {can('maintenance.plans.manage') && (
              <MaintenancePlans
                revision={row?.updatedAt}
                key={org}
                org={org}
                locale={locale}
                canCreate={can('maintenance.create')}
                onCreated={async (value) => {
                  await select(value);
                  await load(org, query);
                }}
              />
            )}
          </>
        )}
      </fieldset>
    </main>
  );
}
