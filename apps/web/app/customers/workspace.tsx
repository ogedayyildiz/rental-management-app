'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
import { createCustomerClient, CustomerApiError } from '@rental/api-client';
import {
  customerAccessSchema,
  customerFieldsSchema,
  customerContactSchema,
  customerAddressSchema,
} from '@rental/validation';
import type {
  CustomerView,
  ContactView,
  AddressView,
  CustomerPage,
} from '@rental/validation';
import { CustomerForm } from './customer-form';
import type { FormKind } from './customer-form';

const api = createCustomerClient('/api/backend');
type Organization = {
  name: string;
  access: { organizationId: string; permissions: string[] };
};
export function CustomerWorkspace() {
  const [locale, setLocale] = useState<Locale>('en');
  const t = (key: TranslationKey) => translate(locale, key);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [org, setOrg] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [page, setPage] = useState<CustomerPage>({
    items: [],
    nextCursor: null,
  });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const epoch = useRef(0);
  const [customer, setCustomer] = useState<CustomerView | null>(null);
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [addresses, setAddresses] = useState<AddressView[]>([]);
  const [form, setForm] = useState<{
    kind: FormKind;
    id: string | null;
    initial: object;
  } | null>(null);
  const permissions =
    organizations.find((item) => item.access.organizationId === org)?.access
      .permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);
  function failure(e: unknown) {
    setError(
      e instanceof CustomerApiError
        ? e.status === 403
          ? 'customers.denied'
          : e.status === 409
            ? 'customers.conflict'
            : 'customers.error'
        : 'customers.error',
    );
  }
  useEffect(() => {
    let ignore = false;
    void (async () => {
      try {
        const response = await fetch('/api/backend/me', { cache: 'no-store' });
        if (!response.ok) throw new CustomerApiError(response.status);
        const data = customerAccessSchema.parse(await response.json());
        const available: Organization[] = data.organizations.flatMap((item) =>
          item.access && item.access.permissions.includes('customers.read')
            ? [{ name: item.name, access: item.access }]
            : [],
        );
        if (ignore) return;
        setOrganizations(available);
        const first = available[0];
        if (first) {
          setOrg(first.access.organizationId);
          const result = await api.list(
            first.access.organizationId,
            new URLSearchParams(),
          );
          if (!ignore) setPage(result);
        }
      } catch (e) {
        if (!ignore) failure(e);
      } finally {
        if (!ignore) setBusy(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);
  async function load(
    organizationId = org,
    cursor: string | null = null,
    history: (string | null)[] = [null],
  ) {
    const generation = ++epoch.current;
    setBusy(true);
    setError(null);
    setCustomer(null);
    setForm(null);
    setPage({ items: [], nextCursor: null });
    try {
      const query = new URLSearchParams({ q, status, limit: '25' });
      if (cursor) query.set('cursor', cursor);
      const result = await api.list(organizationId, query);
      if (generation === epoch.current) {
        setPage(result);
        setCursors(history);
      }
    } catch (e) {
      if (generation === epoch.current) failure(e);
    } finally {
      if (generation === epoch.current) setBusy(false);
    }
  }
  async function open(id: string) {
    setBusy(true);
    setError(null);
    setForm(null);
    try {
      const [record, people, places] = await Promise.all([
        api.get(org, id),
        api.contacts(org, id),
        api.addresses(org, id),
      ]);
      setCustomer(record);
      setContacts(people);
      setAddresses(places);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(input: unknown) {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      let customerId = customer?.id;
      if (form.kind === 'customer') {
        const value = customerFieldsSchema.parse(input);
        const record = form.id
          ? await api.update(org, form.id, value)
          : await api.create(org, value);
        customerId = record.id;
      } else if (customer) {
        if (form.kind === 'contact')
          await api.saveContact(
            org,
            customer.id,
            form.id,
            customerContactSchema.parse(input),
          );
        else
          await api.saveAddress(
            org,
            customer.id,
            form.id,
            customerAddressSchema.parse(input),
          );
      }
      setForm(null);
      if (customerId) await open(customerId);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!customer || !window.confirm(t('customers.archiveConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      setCustomer(await api.archive(org, customer.id));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="customer-workspace">
      <header>
        <div>
          <Link href="/">{t('app.title')}</Link>
          <h1>{t('customers.title')}</h1>
          <p>{t('customers.subtitle')}</p>
        </div>
        <label>
          {t('customers.language')}
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value === 'tr' ? 'tr' : 'en')}
          >
            <option value="en">{t('customers.en')}</option>
            <option value="tr">{t('customers.tr')}</option>
          </select>
        </label>
      </header>
      <div className="customer-toolbar">
        <label>
          {t('customers.organization')}
          <select
            disabled={busy}
            value={org}
            onChange={(e) => {
              setOrg(e.target.value);
              void load(e.target.value);
            }}
          >
            {organizations.map((o) => (
              <option
                value={o.access.organizationId}
                key={o.access.organizationId}
              >
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <a href="/auth/logout">{t('auth.logout')}</a>
      </div>
      {error && (
        <p role="alert" className="customer-error">
          {t(error)}
        </p>
      )}
      {busy && <p role="status">{t('customers.loading')}</p>}
      {!busy && !organizations.length && (
        <p>
          {t('customers.noAccess')}{' '}
          <a href="/auth/login">{t('customers.login')}</a>
        </p>
      )}
      {org && !customer && !form && (
        <>
          <form
            className="customer-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <label className="customer-search">
              {t('customers.search')}
              <input
                value={q}
                maxLength={100}
                onChange={(e) => setQ(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              {t('customers.status')}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={busy}
              >
                {['ACTIVE', 'INACTIVE', 'ALL'].map((s) => (
                  <option key={s} value={s}>
                    {t(`customers.${s}` as TranslationKey)}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>{t('customers.apply')}</button>
            {can('customers.create') && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setForm({ kind: 'customer', id: null, initial: {} })
                }
              >
                {t('customers.create')}
              </button>
            )}
          </form>
          <div className="customer-table">
            <table>
              <thead>
                <tr>
                  <th>{t('customers.displayName')}</th>
                  <th>{t('customers.type')}</th>
                  <th>{t('customers.primaryEmail')}</th>
                  <th>{t('customers.primaryPhone')}</th>
                  <th>{t('customers.status')}</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button disabled={busy} onClick={() => void open(row.id)}>
                        {row.displayName}
                      </button>
                    </td>
                    <td>{t(`customers.${row.type}`)}</td>
                    <td>{row.primaryEmail ?? t('customers.none')}</td>
                    <td>{row.primaryPhone ?? t('customers.none')}</td>
                    <td>
                      {t(
                        row.active ? 'customers.ACTIVE' : 'customers.INACTIVE',
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!busy && !page.items.length && <p>{t('customers.empty')}</p>}
          <div className="customer-actions">
            <button
              disabled={busy || cursors.length < 2}
              onClick={() => {
                const history = cursors.slice(0, -1);
                void load(org, history.at(-1) ?? null, history);
              }}
            >
              {t('customers.previous')}
            </button>
            <button
              disabled={busy || !page.nextCursor}
              onClick={() =>
                void load(org, page.nextCursor, [...cursors, page.nextCursor])
              }
            >
              {t('customers.next')}
            </button>
          </div>
        </>
      )}
      {customer && !form && (
        <>
          <div className="customer-toolbar">
            <button disabled={busy} onClick={() => void load()}>
              {t('customers.back')}
            </button>
            <h2>{customer.displayName}</h2>
            {customer.active && can('customers.update') && (
              <button
                disabled={busy}
                onClick={() =>
                  setForm({
                    kind: 'customer',
                    id: customer.id,
                    initial: customer,
                  })
                }
              >
                {t('customers.edit')}
              </button>
            )}
            {customer.active && can('customers.archive') && (
              <button disabled={busy} onClick={() => void archive()}>
                {t('customers.archive')}
              </button>
            )}
          </div>
          {!customer.active && <p>{t('customers.inactive')}</p>}
          <section className="customer-panel">
            <h3>{t('customers.overview')}</h3>
            <dl>
              {(
                [
                  ['number', customer.customerNumber],
                  ['type', t(`customers.${customer.type}`)],
                  ['legalName', customer.legalName],
                  ['taxOffice', customer.taxOffice],
                  ['identifierCountry', customer.identifierCountry],
                  [
                    'identifierKind',
                    customer.identifierKind
                      ? t(`customers.${customer.identifierKind}`)
                      : null,
                  ],
                  ['identifierValue', customer.identifierValue],
                  ['primaryEmail', customer.primaryEmail],
                  ['primaryPhone', customer.primaryPhone],
                  ['notes', customer.notes],
                ] as const
              ).map(([key, value]) => (
                <div key={key}>
                  <dt>{t(`customers.${key}`)}</dt>
                  <dd>{value ?? t('customers.none')}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="customer-panel">
            <div className="customer-toolbar">
              <h3>{t('customers.contacts')}</h3>
              {customer.active && can('customers.update') && (
                <button
                  disabled={busy}
                  onClick={() =>
                    setForm({ kind: 'contact', id: null, initial: {} })
                  }
                >
                  {t('customers.addContact')}
                </button>
              )}
            </div>
            {!contacts.length && <p>{t('customers.emptyChildren')}</p>}
            {contacts.map((contact) => (
              <article key={contact.id}>
                <h4>
                  {contact.name}{' '}
                  {contact.isPrimary && `· ${t('customers.isPrimary')}`}
                </h4>
                <p>
                  {contact.title} ·{' '}
                  {t(
                    contact.active ? 'customers.ACTIVE' : 'customers.INACTIVE',
                  )}
                </p>
                <p>
                  {contact.email} {contact.phone}
                </p>
                <p>{contact.notes}</p>
                {customer.active && can('customers.update') && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      setForm({
                        kind: 'contact',
                        id: contact.id,
                        initial: contact,
                      })
                    }
                  >
                    {t('customers.edit')}
                  </button>
                )}
              </article>
            ))}
          </section>
          <section className="customer-panel">
            <div className="customer-toolbar">
              <h3>{t('customers.addresses')}</h3>
              {customer.active && can('customers.update') && (
                <button
                  disabled={busy}
                  onClick={() =>
                    setForm({ kind: 'address', id: null, initial: {} })
                  }
                >
                  {t('customers.addAddress')}
                </button>
              )}
            </div>
            {!addresses.length && <p>{t('customers.emptyChildren')}</p>}
            {addresses.map((address) => (
              <article key={address.id}>
                <h4>
                  {address.label} · {t(`customers.${address.type}`)}{' '}
                  {address.isPrimary && `· ${t('customers.isPrimary')}`}
                </h4>
                <p>
                  {[
                    address.line1,
                    address.line2,
                    address.district,
                    address.city,
                    address.region,
                    address.postalCode,
                    address.countryCode,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                <p>
                  {t(
                    address.active ? 'customers.ACTIVE' : 'customers.INACTIVE',
                  )}
                </p>
                <p>{address.notes}</p>
                {customer.active && can('customers.update') && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      setForm({
                        kind: 'address',
                        id: address.id,
                        initial: address,
                      })
                    }
                  >
                    {t('customers.edit')}
                  </button>
                )}
              </article>
            ))}
          </section>
        </>
      )}
      {form && (
        <CustomerForm
          key={`${org}-${form.kind}-${form.id ?? 'new'}`}
          kind={form.kind}
          initial={form.initial}
          locale={locale}
          busy={busy}
          onSave={save}
          onCancel={() => setForm(null)}
        />
      )}
    </main>
  );
}
