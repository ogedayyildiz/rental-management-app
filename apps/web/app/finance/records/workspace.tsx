'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { translate, type Locale, type TranslationKey } from '@rental/i18n';
import {
  createFinanceOperationsClient,
  FinanceOperationsError,
  createCustomerClient,
  createMachineClient,
  createRentalClient,
} from '@rental/api-client';
import {
  financeRecordInputSchema,
  financePaymentInputSchema,
  type FinanceInput,
  type FinanceView,
  type FinanceQuery,
} from '@rental/validation';
import { useApplication } from '../../app-shell';
import { CurrencySelect } from '../../currency-select';
import { TaxFields, TaxSummary, taxFormValue } from '../../tax-fields';
const api = createFinanceOperationsClient('/api/backend'),
  customers = createCustomerClient('/api/backend'),
  machines = createMachineClient('/api/backend'),
  rentals = createRentalClient('/api/backend');
type T = (key: string) => string;
const zero = (v: string) => /^0(?:\.0+)?$/.test(v);
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function FinanceRecordsPage() {
  const { org, locale, account } = useApplication(),
    q = useSearchParams(),
    access = account?.organizations.find(
      (o) => o.access?.organizationId === org,
    )?.access;
  if (!access) return <p role="status">{translate(locale, 'cash.denied')}</p>;
  return (
    <Workspace
      key={org}
      org={org}
      locale={locale}
      permissions={access.permissions}
      selectedOnly={access.branchScope === 'SELECTED_BRANCHES'}
      initialKind={q.get('kind') === 'PAYABLE' ? 'PAYABLE' : 'RECEIVABLE'}
      customerId={q.get('customerId') ?? ''}
      machineId={q.get('machineId') ?? ''}
      rentalId={q.get('rentalId') ?? ''}
    />
  );
}
function Workspace({
  org,
  locale,
  permissions,
  selectedOnly,
  initialKind,
  customerId,
  machineId,
  rentalId,
}: {
  org: string;
  locale: Locale;
  permissions: string[];
  selectedOnly: boolean;
  initialKind: FinanceQuery['kind'];
  customerId: string;
  machineId: string;
  rentalId: string;
}) {
  const can = (p: string) => permissions.includes(p),
    t: T = (k) => translate(locale, ('cash.' + k) as TranslationKey),
    readable = (kind: FinanceQuery['kind']) =>
      kind === 'PAYABLE'
        ? can('finance.payables.view') &&
          can('machines.read') &&
          can('finance.acquisition_cost.view')
        : can('finance.receivables.view') && can('customers.read');
  const [kind, K] = useState<FinanceQuery['kind']>(
      readable(initialKind)
        ? initialKind
        : readable('RECEIVABLE')
          ? 'RECEIVABLE'
          : 'PAYABLE',
    ),
    [query, Q] = useState(''),
    [filter, F] = useState(''),
    [cursor, C] = useState(''),
    [previous, Prev] = useState<string[]>([]),
    [revision, R] = useState(0),
    [items, Items] = useState<FinanceView[]>([]),
    [balances, Balances] = useState<Awaited<ReturnType<typeof api.balances>>>(
      [],
    ),
    [next, Next] = useState<string | null>(null),
    [row, Row] = useState<FinanceView | null>(null),
    [editing, Edit] = useState(false),
    [busy, B] = useState(true),
    [error, E] = useState(''),
    [reason, Reason] = useState('');
  function fail(e: unknown) {
    E(
      e instanceof FinanceOperationsError
        ? e.status === 403
          ? 'denied'
          : e.code === 'INVALID_INPUT'
            ? 'invalid'
            : e.code === 'INVALID_TRANSITION'
              ? 'transition'
              : e.code === 'CONFLICT'
                ? 'conflict'
                : 'failed'
        : 'failed',
    );
  }
  const allowed = readable(kind),
    manage = can(
      kind === 'PAYABLE'
        ? 'finance.payables.manage'
        : 'finance.receivables.manage',
    );
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    const q = new URLSearchParams({
      kind,
      q: filter,
      ...(kind === 'RECEIVABLE' && customerId ? { customerId } : {}),
      ...(kind === 'PAYABLE' && machineId ? { machineId } : {}),
      ...(cursor ? { cursor } : {}),
    });
    Promise.all([api.list(org, q), api.balances(org, q)])
      .then(([page, totals]) => {
        if (live) {
          Items(page.items);
          Next(page.nextCursor);
          Balances(totals);
        }
      })
      .catch((e) => {
        if (live) fail(e);
      })
      .finally(() => {
        if (live) B(false);
      });
    return () => {
      live = false;
    };
  }, [org, kind, filter, cursor, revision, allowed, customerId, machineId]);
  async function run(work: () => Promise<FinanceView>) {
    B(true);
    E('');
    try {
      Row(await work());
      Edit(false);
      R((v) => v + 1);
    } catch (e) {
      fail(e);
    } finally {
      B(false);
    }
  }
  function back() {
    Row(null);
    Edit(false);
    Reason('');
    E('');
  }
  return (
    <main className="customer-workspace">
      <header>
        <h1>{t('title')}</h1>
        {can('finance.analytics.view') && can('machines.read') && (
          <Link href={`/finance?organizationId=${org}`}>{t('analytics')}</Link>
        )}
      </header>
      <p>{t('estimateHint')}</p>
      <nav aria-label={t('title')}>
        {(['RECEIVABLE', 'PAYABLE'] as const).filter(readable).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            disabled={busy}
            onClick={() => {
              K(k);
              back();
              C('');
              Prev([]);
              F('');
              Q('');
            }}
          >
            {t(k)}
          </button>
        ))}
      </nav>
      {!allowed ? (
        <p role="alert">{t('denied')}</p>
      ) : (
        <>
          {error && <p role="alert">{t(error)}</p>}
          {busy && <p role="status">{t('loading')}</p>}
          {editing ? (
            <RecordForm
              key={row?.updatedAt ?? 'new'}
              org={org}
              kind={kind}
              locale={locale}
              t={t}
              row={row}
              busy={busy}
              selectedOnly={selectedOnly}
              initial={{ customerId, machineId, rentalId }}
              canReadRentals={
                can('rentals.read') && can('rentals.pricing.view')
              }
              save={(input) =>
                run(() =>
                  row
                    ? api.update(org, row.id, {
                        version: row.updatedAt,
                        record: input,
                      })
                    : api.create(org, input),
                )
              }
              cancel={() => {
                Edit(false);
                E('');
              }}
            />
          ) : row ? (
            <section className="customer-panel">
              <h2>{row.title}</h2>
              <button disabled={busy} onClick={back}>
                {t('close')}
              </button>
              <p>
                {t(row.status)} · {t(row.settlementStatus)} ·{' '}
                {row.customerName ?? row.fleetNumber} ·{' '}
                {row.branchName ?? t('none')}
              </p>
              {row.acquisitionMethod && (
                <p>
                  {t(row.acquisitionMethod)} · {row.counterpartyName}
                </p>
              )}
              <p>
                <TaxSummary tax={row.tax} locale={locale} />
              </p>
              <dl>
                {(
                  [
                    'netAmount',
                    'taxAmount',
                    'grossAmount',
                    'paidAmount',
                    'remainingAmount',
                  ] as const
                ).map((key, i) => (
                  <div key={key}>
                    <dt>
                      {t(['net', 'tax', 'gross', 'paid', 'remaining'][i]!)}
                    </dt>
                    <dd data-testid={key}>
                      {row[key]} {row.currency}
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                {t(row.documentStatus)} · {row.documentReference ?? t('none')}
              </p>
              <p>{row.notes}</p>
              <h3>{t('schedule')}</h3>
              <table>
                <thead>
                  <tr>
                    <th>{t('installmentKind')}</th>
                    <th>{t('due')}</th>
                    <th>{t('amount')}</th>
                    <th>{t('paid')}</th>
                    <th>{t('remaining')}</th>
                  </tr>
                </thead>
                <tbody>
                  {row.installments.map((i) => (
                    <tr key={i.id}>
                      <td>{t(i.kind)}</td>
                      <td>
                        {i.dueOn} {i.overdue && t('overdue')}
                      </td>
                      <td>
                        {i.amount} {row.currency}
                      </td>
                      <td>{i.paidAmount}</td>
                      <td>{i.remainingAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {manage && row.status === 'DRAFT' && (
                <>
                  <button disabled={busy} onClick={() => Edit(true)}>
                    {t('edit')}
                  </button>
                  <p>{t('confirmHint')}</p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t('confirmHint')))
                        void run(() =>
                          api.action(org, row.id, 'confirm', {
                            version: row.updatedAt,
                          }),
                        );
                    }}
                  >
                    {t('confirm')}
                  </button>
                </>
              )}
              {manage && row.status !== 'CANCELLED' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const d = new FormData(e.currentTarget);
                    void run(() =>
                      api.action(org, row.id, 'document', {
                        documentStatus: d.get('documentStatus'),
                        documentReference: d.get('documentReference') || null,
                      }),
                    );
                  }}
                >
                  <DocumentFields t={t} row={row} />
                  <button disabled={busy}>{t('documentSave')}</button>
                </form>
              )}
              {row.status === 'CONFIRMED' &&
                !zero(row.remainingAmount) &&
                can('finance.payments.record') && (
                  <PaymentForm
                    key={row.updatedAt}
                    row={row}
                    t={t}
                    busy={busy}
                    save={(body) =>
                      run(() => api.action(org, row.id, 'payments', body))
                    }
                  />
                )}
              <h3>{t('payments')}</h3>
              {row.payments.map((p) => (
                <div key={p.id}>
                  <p>
                    {p.paidOn} · {p.amount} {p.currency} ·{' '}
                    {t('payment.' + p.method)} · {p.reference}{' '}
                    {p.reversedAt && t('reversed')}
                  </p>
                  {p.reversedAt && <p>{p.reversalReason}</p>}
                  {!p.reversedAt && can('finance.payments.reverse') && (
                    <button
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void run(() =>
                          api.reverse(org, row.id, p.id, { reason }),
                        )
                      }
                    >
                      {t('reverse')}
                    </button>
                  )}
                </div>
              ))}
              {(manage || can('finance.payments.reverse')) && (
                <label>
                  {t('reason')}
                  <input
                    value={reason}
                    onChange={(e) => Reason(e.target.value)}
                    maxLength={1000}
                  />
                </label>
              )}
              {manage && row.status !== 'CANCELLED' && (
                <button
                  disabled={
                    busy ||
                    !reason.trim() ||
                    row.payments.some((p) => !p.reversedAt)
                  }
                  onClick={() =>
                    void run(() =>
                      api.action(org, row.id, 'cancel', {
                        version: row.updatedAt,
                        reason,
                      }),
                    )
                  }
                >
                  {t('cancel')}
                </button>
              )}
            </section>
          ) : (
            <>
              <h2>{t(kind)}</h2>
              {manage && (
                <button
                  disabled={busy}
                  onClick={() => {
                    Edit(true);
                    E('');
                  }}
                >
                  {t('new')}
                </button>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  F(query);
                  C('');
                  Prev([]);
                  R((v) => v + 1);
                }}
              >
                <label>
                  {t('query')}
                  <input
                    value={query}
                    onChange={(e) => Q(e.target.value)}
                    maxLength={200}
                  />
                </label>
                <button disabled={busy}>{t('search')}</button>
              </form>
              <section>
                <h3>{t('account')}</h3>
                <p>{t('accountHint')}</p>
                {balances.map((b) => (
                  <p key={b.currency}>
                    {b.currency} · {t('gross')}: {b.grossAmount} · {t('paid')}:{' '}
                    {b.paidAmount} · {t('remaining')}: {b.remainingAmount}
                  </p>
                ))}
              </section>
              {!busy && !items.length && !error && <p>{t('empty')}</p>}
              <div className="finance-table">
                <table>
                  <thead>
                    <tr>
                      {[
                        'label',
                        'customer',
                        'machine',
                        'status',
                        'gross',
                        'remaining',
                      ].map((k) => (
                        <th key={k}>{t(k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() => void run(() => api.get(org, i.id))}
                          >
                            {i.title}
                          </button>
                        </td>
                        <td>{i.customerName}</td>
                        <td>{i.fleetNumber}</td>
                        <td>
                          {t(i.status)} · {t(i.settlementStatus)}
                        </td>
                        <td>
                          {i.grossAmount} {i.currency}
                        </td>
                        <td>
                          {i.remainingAmount} {i.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                disabled={busy || !previous.length}
                onClick={() => {
                  C(previous.at(-1) ?? '');
                  Prev((v) => v.slice(0, -1));
                }}
              >
                {t('previous')}
              </button>
              <button
                disabled={busy || !next}
                onClick={() => {
                  Prev((v) => [...v, cursor]);
                  C(next ?? '');
                }}
              >
                {t('next')}
              </button>
            </>
          )}
        </>
      )}
    </main>
  );
}
function DocumentFields({ t, row }: { t: T; row: FinanceView | null }) {
  return (
    <>
      <label>
        {t('document')}
        <select
          name="documentStatus"
          defaultValue={row?.documentStatus ?? 'NONE'}
        >
          {(['NONE', 'PENDING', 'RECORDED', 'OTHER'] as const).map((v) => (
            <option value={v} key={v}>
              {t(v)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('reference')}
        <input
          name="documentReference"
          defaultValue={row?.documentReference ?? ''}
          maxLength={200}
        />
      </label>
      <p>{t('documentHint')}</p>
    </>
  );
}
function RecordForm({
  org,
  kind,
  locale,
  t,
  row,
  busy,
  selectedOnly,
  initial,
  canReadRentals,
  save,
  cancel,
}: {
  org: string;
  kind: FinanceQuery['kind'];
  locale: Locale;
  t: T;
  row: FinanceView | null;
  busy: boolean;
  selectedOnly: boolean;
  initial: { customerId: string; machineId: string; rentalId: string };
  canReadRentals: boolean;
  save: (v: FinanceInput) => Promise<void>;
  cancel: () => void;
}) {
  const [invalid, I] = useState(false),
    [lookupError, LE] = useState(false),
    [q, Q] = useState(''),
    [branches, Branches] = useState<{ id: string; name: string }[]>([]),
    [choices, Choices] = useState<{ id: string; name: string }[]>([]),
    [selectedChoice, SelectedChoice] = useState<{
      id: string;
      name: string;
    } | null>(null),
    [rentalChoices, RC] = useState<{ id: string; number: string }[]>([]),
    [customerId, C] = useState(row?.customerId ?? initial.customerId),
    [machineId, M] = useState(row?.machineId ?? initial.machineId),
    [rentalId, RI] = useState(row?.rentalId ?? initial.rentalId),
    [schedule, S] = useState<FinanceInput['installments']>(
      row?.installments.map(({ kind, dueOn, amount }) => ({
        kind,
        dueOn,
        amount,
      })) ?? [],
    );
  const lookup = useCallback(
    async (search: string) => {
      if (kind === 'RECEIVABLE') {
        const result = await customers.list(
          org,
          new URLSearchParams({ q: search, status: 'ALL' }),
        );
        return result.items.map((c) => ({ id: c.id, name: c.displayName }));
      } else {
        const result = await machines.list(
          org,
          new URLSearchParams({ q: search, lifecycleState: 'ALL' }),
        );
        return result.items.map((m) => ({
          id: m.id,
          name: `${m.fleetNumber} · ${m.manufacturer} ${m.model}`,
        }));
      }
    },
    [org, kind],
  );
  useEffect(() => {
    let live = true;
    api
      .branches(org, kind)
      .then((b) => {
        if (live) Branches(b);
      })
      .catch(() => {
        if (live) LE(true);
      });
    lookup('')
      .then((result) => {
        if (live) Choices(result);
      })
      .catch(() => {
        if (live) LE(true);
      });
    return () => {
      live = false;
    };
  }, [org, kind, lookup]);
  useEffect(() => {
    let live = true;
    if (kind === 'RECEIVABLE' && customerId && canReadRentals)
      rentals
        .list(org, new URLSearchParams({ customerId, limit: '100' }))
        .then(async (r) => {
          const selected =
            rentalId && !r.items.some((v) => v.id === rentalId)
              ? await rentals.get(org, rentalId)
              : null;
          if (live)
            RC(
              selected && selected.customerId === customerId
                ? [selected, ...r.items]
                : r.items,
            );
        })
        .catch(() => {
          if (live) LE(true);
        });
    return () => {
      live = false;
    };
  }, [org, kind, customerId, rentalId, canReadRentals]);
  useEffect(() => {
    let live = true;
    const id = kind === 'RECEIVABLE' ? customerId : machineId;
    if (!id) return;
    const request =
      kind === 'RECEIVABLE'
        ? customers
            .get(org, id)
            .then((c) => ({ id: c.id, name: c.displayName }))
        : machines
            .get(org, id)
            .then((m) => ({ id: m.id, name: m.fleetNumber }));
    request
      .then((v) => {
        if (live) SelectedChoice(v);
      })
      .catch(() => {
        if (live) LE(true);
      });
    return () => {
      live = false;
    };
  }, [org, kind, customerId, machineId]);
  return (
    <form
      className="customer-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget),
          str = (k: string) => String(d.get(k) ?? '');
        const parsed = financeRecordInputSchema.safeParse({
          kind,
          title: str('title'),
          customerId: kind === 'RECEIVABLE' ? customerId : null,
          machineId: kind === 'PAYABLE' ? machineId : null,
          rentalId: kind === 'RECEIVABLE' ? rentalId || null : null,
          branchId: str('branchId') || null,
          acquisitionMethod:
            kind === 'PAYABLE' ? str('acquisitionMethod') : null,
          counterpartyName: kind === 'PAYABLE' ? str('counterpartyName') : null,
          occurredOn: str('occurredOn'),
          amount: str('amount'),
          currency: str('currency'),
          tax: taxFormValue(d),
          documentStatus: str('documentStatus'),
          documentReference: str('documentReference') || null,
          notes: str('notes') || null,
          installments: schedule,
        });
        I(!parsed.success);
        if (parsed.success) void save(parsed.data);
      }}
    >
      <h2>{t(row ? 'edit' : 'new')}</h2>
      {invalid && <p role="alert">{t('invalid')}</p>}
      {lookupError && <p role="alert">{t('failed')}</p>}
      <fieldset disabled={busy} className="customer-fields">
        <label>
          {t('label')}
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={row?.title ?? ''}
          />
        </label>
        <label>
          {t('search')}
          <input value={q} onChange={(e) => Q(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => {
            LE(false);
            void lookup(q)
              .then(Choices)
              .catch(() => LE(true));
          }}
        >
          {t('search')}
        </button>
        <label>
          {t(kind === 'RECEIVABLE' ? 'customer' : 'machine')}
          <select
            required
            value={kind === 'RECEIVABLE' ? customerId : machineId}
            onChange={(e) => {
              if (kind === 'RECEIVABLE') {
                C(e.target.value);
                RI('');
              } else M(e.target.value);
            }}
          >
            <option value="">{t('choose')}</option>
            {(selectedChoice &&
            selectedChoice.id ===
              (kind === 'RECEIVABLE' ? customerId : machineId) &&
            !choices.some((v) => v.id === selectedChoice.id)
              ? [selectedChoice, ...choices]
              : choices
            ).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {kind === 'RECEIVABLE' && canReadRentals && (
          <label>
            {t('rental')}
            <select value={rentalId} onChange={(e) => RI(e.target.value)}>
              <option value="">{t('none')}</option>
              {rentalChoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.number}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {t('branch')}
          <select
            name="branchId"
            required={selectedOnly}
            defaultValue={row?.branchId ?? ''}
          >
            <option value="">{selectedOnly ? t('choose') : t('none')}</option>
            {branches.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {kind === 'PAYABLE' && (
          <>
            <label>
              {t('method')}
              <select
                name="acquisitionMethod"
                required
                defaultValue={row?.acquisitionMethod ?? ''}
              >
                <option value="">{t('choose')}</option>
                {(['CASH', 'OPEN_ACCOUNT', 'LEASING'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('supplier')}
              <input
                name="counterpartyName"
                required
                maxLength={200}
                defaultValue={row?.counterpartyName ?? ''}
              />
            </label>
          </>
        )}
        <label>
          {t('date')}
          <input
            type="date"
            name="occurredOn"
            required
            defaultValue={row?.occurredOn ?? localDate()}
          />
        </label>
        <label>
          {t('amount')}
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={row?.amount ?? ''}
          />
        </label>
        <label>
          {t('currency')}
          <CurrencySelect
            locale={locale}
            name="currency"
            required
            defaultValue={row?.currency ?? ''}
          />
        </label>
        <TaxFields locale={locale} required defaultValue={row?.tax} />
        <DocumentFields t={t} row={row} />
        <label>
          {t('notes')}
          <textarea
            name="notes"
            maxLength={5000}
            defaultValue={row?.notes ?? ''}
          />
        </label>
        <section>
          <h3>{t('schedule')}</h3>
          <p>{t('scheduleHint')}</p>
          {schedule.map((v, i) => (
            <fieldset key={i}>
              <legend>
                {t('schedule')} {i + 1}
              </legend>
              <label>
                {t('installmentKind')}
                <select
                  value={v.kind}
                  onChange={(e) =>
                    S((a) =>
                      a.map((r, n) =>
                        n === i
                          ? { ...r, kind: e.target.value as typeof v.kind }
                          : r,
                      ),
                    )
                  }
                >
                  {(['DEPOSIT', 'INSTALLMENT', 'DUE'] as const).map((k) => (
                    <option value={k} key={k}>
                      {t(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('due')}
                <input
                  type="date"
                  required
                  value={v.dueOn}
                  onChange={(e) =>
                    S((a) =>
                      a.map((r, n) =>
                        n === i ? { ...r, dueOn: e.target.value } : r,
                      ),
                    )
                  }
                />
              </label>
              <label>
                {t('amount')}
                <input
                  required
                  inputMode="decimal"
                  value={v.amount}
                  onChange={(e) =>
                    S((a) =>
                      a.map((r, n) =>
                        n === i ? { ...r, amount: e.target.value } : r,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                onClick={() => S((a) => a.filter((_, n) => i !== n))}
              >
                {t('remove')}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              S((a) => [
                ...a,
                { kind: 'INSTALLMENT', dueOn: localDate(), amount: '' },
              ])
            }
          >
            {t('addInstallment')}
          </button>
        </section>
        <button>{t('save')}</button>
        <button type="button" onClick={cancel}>
          {t('close')}
        </button>
      </fieldset>
    </form>
  );
}
function PaymentForm({
  row,
  t,
  busy,
  save,
}: {
  row: FinanceView;
  t: T;
  busy: boolean;
  save: (v: unknown) => Promise<void>;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [invalid, I] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget),
          parsed = financePaymentInputSchema.safeParse({
            ...Object.fromEntries(d),
            idempotencyKey: key,
            currency: row.currency,
            reference: d.get('reference') || null,
          });
        I(!parsed.success);
        if (parsed.success) void save(parsed.data);
      }}
    >
      <h3>{t('payment')}</h3>
      {invalid && <p role="alert">{t('invalid')}</p>}
      <fieldset disabled={busy}>
        <label>
          {t('schedule')}
          <select name="installmentId" required>
            <option value="">{t('choose')}</option>
            {row.installments
              .filter((i) => !zero(i.remainingAmount))
              .map((i) => (
                <option value={i.id} key={i.id}>
                  {t(i.kind)} · {i.dueOn} · {i.remainingAmount} {row.currency}
                </option>
              ))}
          </select>
        </label>
        <label>
          {t('amount')} ({row.currency})
          <input name="amount" required inputMode="decimal" />
        </label>
        <label>
          {t('paymentDate')}
          <input
            name="paidOn"
            type="date"
            required
            defaultValue={localDate()}
          />
        </label>
        <label>
          {t('paymentMethod')}
          <select name="method" required>
            <option value="">{t('choose')}</option>
            {(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'] as const).map((v) => (
              <option key={v} value={v}>
                {t('payment.' + v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('paymentReference')}
          <input name="reference" maxLength={200} />
        </label>
        <button>{t('payment')}</button>
      </fieldset>
    </form>
  );
}
