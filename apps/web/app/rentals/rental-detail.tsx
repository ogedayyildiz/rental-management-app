'use client';
import { useState } from 'react';
import { createRentalClient } from '@rental/api-client';
import type { RentalAction } from '@rental/api-client';
import type {
  RentalCatalog,
  RentalView,
  RentalItemView,
  RentalAvailabilityPage,
} from '@rental/validation';
import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
import { utcInput, fromUtc } from './rental-form';
const api = createRentalClient('/api/backend');
export function RentalDetail({
  row,
  catalog,
  locale,
  can,
  busy,
  act,
  edit,
  fail,
}: {
  row: RentalView;
  catalog: RentalCatalog;
  locale: Locale;
  can: (p: string) => boolean;
  busy: boolean;
  act: (action: RentalAction, body?: unknown) => Promise<void>;
  edit: () => void;
  fail: (e: unknown) => void;
}) {
  const t = (k: TranslationKey) => translate(locale, k),
    date = (v: string | null) =>
      v
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: row.timezone,
          }).format(new Date(v))
        : '—';
  const [actual, setActual] = useState(utcInput(new Date().toISOString())),
    [reason, setReason] = useState(''),
    [extension, setExtension] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [allocation, setAllocation] = useState<{
      itemId: string;
      replaceId?: string;
    } | null>(null),
    [available, setAvailable] = useState<RentalAvailabilityPage>({
      items: [],
      nextCursor: null,
    }),
    [search, setSearch] = useState(''),
    [loading, setLoading] = useState(false);
  const mutable = ['DRAFT', 'QUOTED'].includes(row.status),
    committed = ['RESERVED', 'ACTIVE'].includes(row.status),
    items = row.items.filter((i) => !i.removedAt),
    assignments = items.flatMap((i) =>
      i.assignments.filter((a) => !a.releasedAt),
    );
  async function execute(action: RentalAction, body?: unknown) {
    if (!window.confirm(t('rentals.confirm'))) return;
    await act(action, body);
    setSelected([]);
    setAllocation(null);
  }
  async function find(
    item: RentalItemView,
    replaceId?: string,
    cursor?: string,
  ) {
    if (!item.plannedStartAt || !item.plannedEndAt) return;
    setLoading(true);
    try {
      setAllocation({ itemId: item.id, ...(replaceId ? { replaceId } : {}) });
      const q = new URLSearchParams({
        plannedStartAt: item.plannedStartAt,
        plannedEndAt: item.plannedEndAt,
        q: search,
        ...(row.branchId ? { branchId: row.branchId } : {}),
        ...(item.requestedCategoryId
          ? { requestedCategoryId: item.requestedCategoryId }
          : {}),
        ...(item.requestedModelId
          ? { requestedModelId: item.requestedModelId }
          : {}),
        ...(!replaceId ? { rentalId: row.id, itemId: item.id } : {}),
        ...(cursor ? { cursor } : {}),
      });
      setAvailable(await api.availability(row.organizationId, q));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="rental-panel">
      <h2>
        {row.number} · {t(`rentals.${row.status}`)}
      </h2>
      <p>
        {row.customerName} · {row.branchName ?? t('rentals.unassigned')}
      </p>
      <p>
        {t('rentals.planned')}: {date(row.plannedStartAt)} —{' '}
        {date(row.plannedEndAt)}
      </p>
      <p>
        {t('rentals.actual')}: {date(row.actualStartAt)} —{' '}
        {date(row.actualEndAt)}
      </p>
      <p>{row.notes}</p>
      <p>
        {t('rentals.utcHint')} {row.timezone}
      </p>
      <fieldset disabled={busy || loading}>
        <div className="rental-grid">
          <label>
            {t('rentals.actualTime')}
            <input
              type="datetime-local"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
          </label>
          <label>
            {t('rentals.reason')}
            <input
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label>
            {t('rentals.extensionEnd')}
            <input
              type="datetime-local"
              value={extension}
              onChange={(e) => setExtension(e.target.value)}
            />
          </label>
        </div>
        <div className="rental-actions">
          {mutable && can('rentals.update') && (
            <button onClick={edit}>{t('rentals.edit')}</button>
          )}
          {row.status === 'DRAFT' && can('rentals.update') && (
            <button onClick={() => void execute('quote')}>
              {t('rentals.quote')}
            </button>
          )}
          {mutable && can('rentals.reserve') && (
            <button onClick={() => void execute('reserve')}>
              {t('rentals.reserve')}
            </button>
          )}
          {committed && can('rentals.dispatch') && (
            <button
              disabled={
                !actual ||
                !selected.length ||
                selected.some(
                  (id) => assignments.find((a) => a.id === id)?.actualStartAt,
                )
              }
              onClick={() =>
                void execute('dispatch', {
                  assignmentIds: selected,
                  actualStartAt: fromUtc(actual),
                })
              }
            >
              {t('rentals.dispatch')}
            </button>
          )}
          {row.status === 'ACTIVE' && can('rentals.return') && (
            <>
              <button
                disabled={
                  !actual ||
                  !selected.length ||
                  selected.some(
                    (id) =>
                      !assignments.find((a) => a.id === id)?.actualStartAt ||
                      assignments.find((a) => a.id === id)?.actualEndAt,
                  )
                }
                onClick={() =>
                  void execute('return', {
                    assignmentIds: selected,
                    actualEndAt: fromUtc(actual),
                  })
                }
              >
                {t('rentals.return')}
              </button>
              <button
                disabled={items.some(
                  (i) =>
                    i.assignments.filter((a) => !a.releasedAt && a.actualEndAt)
                      .length < i.quantity,
                )}
                onClick={() => void execute('complete')}
              >
                {t('rentals.complete')}
              </button>
            </>
          )}
          {(mutable || row.status === 'RESERVED') && can('rentals.cancel') && (
            <button
              disabled={!reason.trim()}
              onClick={() => void execute('cancel', { reason })}
            >
              {t('rentals.cancel')}
            </button>
          )}
          {committed && can('rentals.extend') && (
            <button
              disabled={!extension}
              onClick={() =>
                void execute('extend', {
                  items: items
                    .filter(
                      (i) =>
                        i.assignments.filter(
                          (a) => !a.releasedAt && a.actualEndAt,
                        ).length < i.quantity,
                    )
                    .map((i) => ({
                      itemId: i.id,
                      plannedEndAt: fromUtc(extension),
                    })),
                })
              }
            >
              {t('rentals.extend')}
            </button>
          )}
        </div>
        <h3>{t('rentals.items')}</h3>
        {items.map((item, n) => (
          <section className="rental-panel" key={item.id}>
            <h3>
              {t('rentals.line')} {n + 1} · {t('rentals.quantity')}:{' '}
              {item.quantity}
            </h3>
            <p>
              {
                catalog.categories.find(
                  (c) => c.id === item.requestedCategoryId,
                )?.name
              }{' '}
              {catalog.models.find((m) => m.id === item.requestedModelId)?.name}
            </p>
            <p>
              {date(item.plannedStartAt)} — {date(item.plannedEndAt)}
            </p>
            {item.specifications.platformHeightM !== undefined && (
              <p>
                {t('rentals.platformHeight')}:{' '}
                {item.specifications.platformHeightM}
              </p>
            )}
            {item.agreedRate !== undefined && (
              <p>
                {item.agreedRate} {item.currency} /{' '}
                {item.rateUnit ? t(`rentals.${item.rateUnit}`) : '—'}{' '}
                {item.commercialNotes}
              </p>
            )}
            {item.assignments.map((a) => (
              <div className="rental-panel" key={a.id}>
                <label className="rental-check">
                  <input
                    type="checkbox"
                    checked={selected.includes(a.id)}
                    disabled={
                      Boolean(a.releasedAt || a.actualEndAt) || !committed
                    }
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked
                          ? [...v, a.id]
                          : v.filter((id) => id !== a.id),
                      )
                    }
                  />
                  {a.fleetNumber} · {a.manufacturer} {a.model}
                </label>
                <small>
                  {t('rentals.assigned')}: {date(a.assignedAt)} ·{' '}
                  {t('rentals.dispatched')}: {date(a.actualStartAt)} ·{' '}
                  {t('rentals.returned')}: {date(a.actualEndAt)} ·{' '}
                  {t('rentals.released')}: {date(a.releasedAt)}
                </small>
                {a.reason && <p>{a.reason}</p>}
                {!a.releasedAt &&
                  !a.actualStartAt &&
                  Boolean(item.requestedCategoryId || item.requestedModelId) &&
                  (mutable || committed) &&
                  can('rentals.update') && (
                    <button
                      disabled={!reason.trim()}
                      onClick={() =>
                        void execute('release', { assignmentId: a.id, reason })
                      }
                    >
                      {t('rentals.release')}
                    </button>
                  )}
                {!a.releasedAt &&
                  a.actualStartAt &&
                  !a.actualEndAt &&
                  row.status === 'ACTIVE' &&
                  can('rentals.update') &&
                  can('rentals.return') &&
                  can('rentals.dispatch') && (
                    <button
                      disabled={!reason.trim() || !actual}
                      onClick={() => void find(item, a.id)}
                    >
                      {t('rentals.replace')}
                    </button>
                  )}
              </div>
            ))}
            {(mutable || committed) &&
              can('rentals.update') &&
              item.assignments.filter((a) => !a.releasedAt).length <
                item.quantity && (
                <button onClick={() => void find(item)}>
                  {t('rentals.available')}
                </button>
              )}
            {allocation?.itemId === item.id && (
              <section>
                <label>
                  {t('rentals.search')}
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button onClick={() => void find(item, allocation.replaceId)}>
                  {t('rentals.search')}
                </button>
                <p>{t('rentals.availabilityHint')}</p>
                {available.items.map((m) => (
                  <p key={m.id}>
                    {m.fleetNumber} · {m.manufacturer} {m.model}{' '}
                    <button
                      onClick={() =>
                        void execute(
                          allocation.replaceId ? 'replace' : 'assign',
                          allocation.replaceId
                            ? {
                                assignmentId: allocation.replaceId,
                                machineId: m.id,
                                actualAt: fromUtc(actual),
                                reason,
                              }
                            : { itemId: item.id, machineIds: [m.id] },
                        )
                      }
                    >
                      {t(
                        allocation.replaceId
                          ? 'rentals.replace'
                          : 'rentals.assign',
                      )}
                    </button>
                  </p>
                ))}
                {available.nextCursor && (
                  <button
                    onClick={() =>
                      void find(
                        item,
                        allocation.replaceId,
                        available.nextCursor ?? undefined,
                      )
                    }
                  >
                    {t('rentals.next')}
                  </button>
                )}
              </section>
            )}
            {item.terms && (
              <details>
                <summary>{t('rentals.terms')}</summary>
                {item.terms.map((term) => (
                  <p key={term.id}>
                    {date(term.plannedStartAt)} — {date(term.plannedEndAt)}:{' '}
                    {term.agreedRate} {term.currency} /{' '}
                    {t(`rentals.${term.rateUnit}`)}
                  </p>
                ))}
              </details>
            )}
          </section>
        ))}
      </fieldset>
      <h3>{t('rentals.timeline')}</h3>
      <p>
        {t('rentals.created')}: {date(row.createdAt)} · {t('rentals.updated')}:{' '}
        {date(row.updatedAt)}
      </p>
      {row.cancelledAt && (
        <p>
          {t('rentals.CANCELLED')}: {date(row.cancelledAt)} ·{' '}
          {row.cancellationReason}
        </p>
      )}
      {row.items
        .filter((i) => i.removedAt)
        .map((i) => (
          <p key={i.id}>
            {t('rentals.released')}: {date(i.removedAt)} ·{' '}
            {t('rentals.quantity')}: {i.quantity}
          </p>
        ))}
    </section>
  );
}
