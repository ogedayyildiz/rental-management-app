'use client';
import { useState } from 'react';
import {
  createCustomerClient,
  createRentalClient,
  CustomerApiError,
} from '@rental/api-client';
import {
  customerFieldsSchema,
  rentalCreateSchema,
  rentalPatchSchema,
  rentalRateUnitSchema,
} from '@rental/validation';
import type {
  RentalView,
  RentalCatalog,
  RentalItemInput,
  RentalAvailabilityPage,
} from '@rental/validation';
import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
import { CustomerForm } from '../customers/customer-form';
import '../customers/customers.css';
const api = createRentalClient('/api/backend'),
  customers = createCustomerClient('/api/backend');
export const utcInput = (v: string | null) => v?.slice(0, 16) ?? '';
export const fromUtc = (v: string) =>
  v ? new Date(`${v}Z`).toISOString() : null;
const blank = (): RentalItemInput => ({
  requestedCategoryId: null,
  requestedModelId: null,
  quantity: 1,
  specifications: {},
  machineIds: [],
  plannedStartAt: null,
  plannedEndAt: null,
});
export function RentalForm({
  org,
  catalog,
  locale,
  row,
  canPrice,
  canViewPrice,
  canCreateCustomer,
  busy,
  onSave,
  onClose,
}: {
  org: string;
  catalog: RentalCatalog;
  locale: Locale;
  row: RentalView | null;
  canPrice: boolean;
  canViewPrice: boolean;
  canCreateCustomer: boolean;
  busy: boolean;
  onSave: (v: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const t = (k: TranslationKey) => translate(locale, k);
  const currencyNames = new Intl.DisplayNames([locale], { type: 'currency' });
  const currencies = Intl.supportedValuesOf('currency');
  const [customerId, setCustomer] = useState(row?.customerId ?? ''),
    [branchId, setBranch] = useState(row?.branchId ?? ''),
    [notes, setNotes] = useState(row?.notes ?? ''),
    [items, setItems] = useState<RentalItemInput[]>(
      row
        ? row.items
            .filter((i) => !i.removedAt)
            .map((i) => ({
              requestedCategoryId: i.requestedCategoryId,
              requestedModelId: i.requestedModelId,
              quantity: i.quantity,
              specifications: i.specifications,
              machineIds: i.assignments
                .filter((a) => !a.releasedAt)
                .map((a) => a.machineId),
              plannedStartAt: i.plannedStartAt,
              plannedEndAt: i.plannedEndAt,
              ...(canPrice
                ? {
                    agreedRate: i.agreedRate ?? null,
                    rateUnit: i.rateUnit ?? null,
                    currency: i.currency ?? null,
                    commercialNotes: i.commercialNotes ?? null,
                  }
                : {}),
            }))
        : [blank()],
    ),
    [customerChoices, setCustomers] = useState<
      { id: string; displayName: string }[]
    >(row ? [{ id: row.customerId, displayName: row.customerName }] : []),
    [search, setSearch] = useState(''),
    [creatingCustomer, setCreatingCustomer] = useState(false),
    [savingCustomer, setSavingCustomer] = useState(false),
    [customerError, setCustomerError] = useState<TranslationKey | null>(null),
    [choices, setChoices] = useState<Record<number, RentalAvailabilityPage>>(
      {},
    ),
    [machineSearch, setMachineSearch] = useState(''),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(false);
  const editItems = !row || (canPrice && canViewPrice);
  const change = (index: number, patch: Partial<RentalItemInput>) => {
    setItems((v) =>
      v.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
    setChoices({});
  };
  async function loadCustomers() {
    setLoading(true);
    setError(false);
    try {
      setCustomers((await customers.listActive(org, search)).items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  async function createCustomer(value: unknown) {
    if (!canCreateCustomer || savingCustomer) return;
    setSavingCustomer(true);
    setCustomerError(null);
    try {
      const customer = await customers.create(
        org,
        customerFieldsSchema.parse(value),
      );
      setCustomers((current) => [
        customer,
        ...current.filter((c) => c.id !== customer.id),
      ]);
      setCustomer(customer.id);
      setSearch('');
      setCreatingCustomer(false);
      setError(false);
    } catch (e) {
      setCustomerError(
        e instanceof CustomerApiError && e.status === 403
          ? 'customers.denied'
          : e instanceof CustomerApiError && e.status === 409
            ? 'customers.conflict'
            : 'customers.error',
      );
    } finally {
      setSavingCustomer(false);
    }
  }
  async function available(index: number, cursor?: string) {
    const item = items[index];
    if (!item?.plannedStartAt || !item.plannedEndAt) {
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const q = new URLSearchParams({
        plannedStartAt: item.plannedStartAt,
        plannedEndAt: item.plannedEndAt,
        q: machineSearch,
        ...(item.specifications.platformHeightM === undefined
          ? {}
          : { platformHeightM: String(item.specifications.platformHeightM) }),
        ...(branchId ? { branchId } : {}),
        ...(item.requestedCategoryId
          ? { requestedCategoryId: item.requestedCategoryId }
          : {}),
        ...(item.requestedModelId
          ? { requestedModelId: item.requestedModelId }
          : {}),
        ...(cursor ? { cursor } : {}),
      });
      const page = await api.availability(org, q);
      setChoices((v) => ({ ...v, [index]: page }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      {creatingCustomer && canCreateCustomer && (
        <section
          className="rental-panel"
          aria-label={t('rentals.createCustomer')}
        >
          <h2>{t('rentals.createCustomer')}</h2>
          <p>{t('rentals.createCustomerHint')}</p>
          {customerError && (
            <p role="alert" className="rental-error">
              {t(customerError)}
            </p>
          )}
          <CustomerForm
            kind="customer"
            initial={{ displayName: search }}
            locale={locale}
            busy={savingCustomer}
            onSave={createCustomer}
            onCancel={() => {
              setCreatingCustomer(false);
              setCustomerError(null);
            }}
          />
        </section>
      )}
      <form
        hidden={creatingCustomer && canCreateCustomer}
        className="rental-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError(false);
          const value = {
            customerId,
            branchId: branchId || null,
            notes: notes || null,
            ...(editItems ? { items } : {}),
          };
          const result = (
            row ? rentalPatchSchema : rentalCreateSchema
          ).safeParse(value);
          if (!result.success) {
            setError(true);
            return;
          }
          void onSave(result.data);
        }}
      >
        <h2>{t(row ? 'rentals.edit' : 'rentals.new')}</h2>
        <p>
          {t('rentals.utcHint')} {catalog.timezone}
        </p>
        {error && (
          <p className="rental-error" role="alert">
            {t('rentals.invalid')}
          </p>
        )}
        <fieldset disabled={busy || loading}>
          <div className="rental-grid">
            <label>
              {t('rentals.search')}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button type="button" onClick={() => void loadCustomers()}>
              {t('rentals.loadCustomers')}
            </button>
            {canCreateCustomer && (
              <button
                type="button"
                onClick={() => {
                  setCreatingCustomer(true);
                  setCustomerError(null);
                }}
              >
                {t('rentals.createCustomer')}
              </button>
            )}
            <label>
              {t('rentals.customer')}
              <select
                required
                value={customerId}
                onChange={(e) => setCustomer(e.target.value)}
              >
                <option value="">{t('rentals.choose')}</option>
                {customerChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('rentals.branch')}
              <select
                value={branchId}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setItems((v) => v.map((i) => ({ ...i, machineIds: [] })));
                  setChoices({});
                }}
              >
                <option value="">{t('rentals.unassigned')}</option>
                {catalog.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            {t('rentals.notes')}
            <textarea
              value={notes}
              maxLength={5000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {editItems && (
            <>
              <h3>{t('rentals.items')}</h3>
              <p>{t('rentals.allocateLater')}</p>
              {items.map((item, index) => (
                <section className="rental-panel" key={index}>
                  <h3>
                    {t('rentals.line')} {index + 1}
                  </h3>
                  <div className="rental-grid">
                    <label>
                      {t('rentals.category')}
                      <select
                        value={item.requestedCategoryId ?? ''}
                        onChange={(e) =>
                          change(index, {
                            requestedCategoryId: e.target.value || null,
                            requestedModelId: null,
                            machineIds: [],
                          })
                        }
                      >
                        <option value="">{t('rentals.all')}</option>
                        {catalog.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('rentals.model')}
                      <select
                        value={item.requestedModelId ?? ''}
                        onChange={(e) =>
                          change(index, {
                            requestedModelId: e.target.value || null,
                            machineIds: [],
                          })
                        }
                      >
                        <option value="">{t('rentals.all')}</option>
                        {catalog.models
                          .filter(
                            (m) =>
                              (m.availableForRental ||
                                m.id === item.requestedModelId) &&
                              (!item.requestedCategoryId ||
                                m.categoryId === item.requestedCategoryId),
                          )
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.manufacturer} {m.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      {t('rentals.platformHeight')}
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={item.specifications.platformHeightM ?? ''}
                        onChange={(e) => {
                          const specifications = { ...item.specifications };
                          if (e.target.value === '')
                            delete specifications.platformHeightM;
                          else
                            specifications.platformHeightM =
                              e.target.valueAsNumber;
                          change(index, { specifications, machineIds: [] });
                        }}
                      />
                      <small>{t('rentals.platformHeightHint')}</small>
                    </label>
                    <label>
                      {t('rentals.quantity')}
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={item.quantity}
                        onChange={(e) =>
                          change(index, { quantity: e.target.valueAsNumber })
                        }
                      />
                    </label>
                    <label>
                      {t('rentals.start')}
                      <input
                        type="datetime-local"
                        value={utcInput(item.plannedStartAt)}
                        onChange={(e) =>
                          change(index, {
                            plannedStartAt: fromUtc(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      {t('rentals.end')}
                      <input
                        type="datetime-local"
                        value={utcInput(item.plannedEndAt)}
                        onChange={(e) =>
                          change(index, {
                            plannedEndAt: fromUtc(e.target.value),
                          })
                        }
                      />
                    </label>
                    {canPrice && (
                      <>
                        <label>
                          {t('rentals.rate')}
                          <input
                            inputMode="decimal"
                            value={item.agreedRate ?? ''}
                            onChange={(e) =>
                              change(index, {
                                agreedRate: e.target.value || null,
                              })
                            }
                          />
                        </label>
                        <label>
                          {t('rentals.unit')}
                          <select
                            value={item.rateUnit ?? ''}
                            onChange={(e) =>
                              change(index, {
                                rateUnit:
                                  rentalRateUnitSchema.safeParse(e.target.value)
                                    .data ?? null,
                              })
                            }
                          >
                            <option value="">{t('rentals.choose')}</option>
                            {rentalRateUnitSchema.options.map((u) => (
                              <option key={u} value={u}>
                                {t(`rentals.${u}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t('rentals.currency')}
                          <select
                            value={item.currency ?? ''}
                            onChange={(e) =>
                              change(index, {
                                currency: e.target.value || null,
                              })
                            }
                          >
                            <option value="">{t('rentals.choose')}</option>
                            {item.currency &&
                              !currencies.includes(item.currency) && (
                                <option value={item.currency}>
                                  {item.currency}
                                </option>
                              )}
                            {currencies.map((currency) => (
                              <option key={currency} value={currency}>
                                {currency} — {currencyNames.of(currency)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {t('rentals.commercialNotes')}
                          <input
                            value={item.commercialNotes ?? ''}
                            maxLength={2000}
                            onChange={(e) =>
                              change(index, {
                                commercialNotes: e.target.value || null,
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                  </div>
                  <label>
                    {t('rentals.search')}
                    <input
                      value={machineSearch}
                      onChange={(e) => setMachineSearch(e.target.value)}
                    />
                  </label>
                  <button type="button" onClick={() => void available(index)}>
                    {t('rentals.available')}
                  </button>
                  <p>{t('rentals.availabilityHint')}</p>
                  <p>
                    {t('rentals.machines')}: {item.machineIds.length} /{' '}
                    {item.quantity}
                  </p>
                  {item.machineIds.map((id) => (
                    <label className="rental-check" key={id}>
                      <input
                        type="checkbox"
                        checked
                        onChange={() =>
                          setItems((v) =>
                            v.map((x, i) =>
                              i === index
                                ? {
                                    ...x,
                                    machineIds: x.machineIds.filter(
                                      (m) => m !== id,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      {choices[index]?.items.find((m) => m.id === id)
                        ?.fleetNumber ??
                        row?.items
                          .flatMap((i) => i.assignments)
                          .find((a) => a.machineId === id)?.fleetNumber ??
                        id}
                    </label>
                  ))}
                  {choices[index]?.items
                    .filter((m) => !item.machineIds.includes(m.id))
                    .map((m) => (
                      <label className="rental-check" key={m.id}>
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={item.machineIds.length >= item.quantity}
                          onChange={() =>
                            setItems((v) =>
                              v.map((x, i) =>
                                i === index
                                  ? {
                                      ...x,
                                      machineIds: [...x.machineIds, m.id],
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        {m.fleetNumber} · {m.manufacturer} {m.model}
                      </label>
                    ))}
                  {choices[index]?.nextCursor && (
                    <button
                      type="button"
                      onClick={() =>
                        void available(
                          index,
                          choices[index]?.nextCursor ?? undefined,
                        )
                      }
                    >
                      {t('rentals.next')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setItems((v) => v.filter((_, i) => i !== index));
                      setChoices({});
                    }}
                  >
                    {t('rentals.remove')}
                  </button>
                </section>
              ))}
              <button
                type="button"
                onClick={() => setItems((v) => [...v, blank()])}
              >
                {t('rentals.addItem')}
              </button>
            </>
          )}
          <div className="rental-actions">
            <button type="submit">{t('rentals.save')}</button>
            <button type="button" onClick={onClose}>
              {t('rentals.close')}
            </button>
          </div>
        </fieldset>
      </form>
    </>
  );
}
