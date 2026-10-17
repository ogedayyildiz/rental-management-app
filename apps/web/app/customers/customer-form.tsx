'use client';
import { useState } from 'react';
import type { Locale, TranslationKey } from '@rental/i18n';
import { translate } from '@rental/i18n';
import {
  customerFieldsSchema,
  customerContactSchema,
  customerAddressSchema,
} from '@rental/validation';

export type FormKind = 'customer' | 'contact' | 'address';
type Field = {
  name: string;
  label: TranslationKey;
  required?: boolean;
  options?: readonly string[];
  max?: number;
  checkbox?: boolean;
};
const fields: Record<FormKind, Field[]> = {
  customer: [
    {
      name: 'type',
      label: 'customers.type',
      options: ['COMPANY', 'INDIVIDUAL'],
      required: true,
    },
    {
      name: 'displayName',
      label: 'customers.displayName',
      required: true,
      max: 200,
    },
    { name: 'legalName', label: 'customers.legalName', max: 200 },
    { name: 'taxOffice', label: 'customers.taxOffice', max: 100 },
    { name: 'identifierCountry', label: 'customers.identifierCountry', max: 2 },
    {
      name: 'identifierKind',
      label: 'customers.identifierKind',
      options: ['', 'TAX', 'NATIONAL'],
    },
    { name: 'identifierValue', label: 'customers.identifierValue', max: 40 },
    { name: 'primaryEmail', label: 'customers.primaryEmail', max: 320 },
    { name: 'primaryPhone', label: 'customers.primaryPhone', max: 40 },
    { name: 'notes', label: 'customers.notes', max: 5000 },
  ],
  contact: [
    { name: 'name', label: 'customers.name', required: true, max: 200 },
    { name: 'title', label: 'customers.titleRole', max: 100 },
    { name: 'email', label: 'customers.email', max: 320 },
    { name: 'phone', label: 'customers.phone', max: 40 },
    { name: 'notes', label: 'customers.notes', max: 2000 },
    { name: 'isPrimary', label: 'customers.isPrimary', checkbox: true },
    { name: 'active', label: 'customers.active', checkbox: true },
  ],
  address: [
    {
      name: 'type',
      label: 'customers.type',
      options: ['BILLING', 'HEADQUARTERS', 'DELIVERY', 'SITE', 'OTHER'],
      required: true,
    },
    { name: 'label', label: 'customers.label', required: true, max: 100 },
    {
      name: 'countryCode',
      label: 'customers.countryCode',
      required: true,
      max: 2,
    },
    { name: 'region', label: 'customers.region', max: 100 },
    { name: 'city', label: 'customers.city', required: true, max: 100 },
    { name: 'district', label: 'customers.district', max: 100 },
    { name: 'postalCode', label: 'customers.postalCode', max: 20 },
    { name: 'line1', label: 'customers.line1', required: true, max: 250 },
    { name: 'line2', label: 'customers.line2', max: 250 },
    { name: 'notes', label: 'customers.notes', max: 2000 },
    { name: 'isPrimary', label: 'customers.isPrimary', checkbox: true },
    { name: 'active', label: 'customers.active', checkbox: true },
  ],
};
export function CustomerForm({
  kind,
  initial,
  locale,
  busy,
  onSave,
  onCancel,
}: {
  kind: FormKind;
  initial: object;
  locale: Locale;
  busy: boolean;
  onSave: (value: unknown) => Promise<void>;
  onCancel: () => void;
}) {
  const [invalid, setInvalid] = useState<string[]>([]);
  const t = (key: TranslationKey) => translate(locale, key);
  const values = Object.fromEntries(Object.entries(initial));
  return (
    <form
      className="customer-panel"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const input = Object.fromEntries(
          fields[kind].map((field) => [
            field.name,
            field.checkbox ? data.has(field.name) : data.get(field.name),
          ]),
        );
        if (input.identifierKind === '') input.identifierKind = null;
        const parsed = {
          customer: customerFieldsSchema,
          contact: customerContactSchema,
          address: customerAddressSchema,
        }[kind].safeParse(input);
        if (!parsed.success) {
          setInvalid(
            parsed.error.issues.flatMap((issue) => issue.path.map(String)),
          );
          return;
        }
        setInvalid([]);
        void onSave(parsed.data);
      }}
    >
      <fieldset disabled={busy} className="customer-fields">
        {fields[kind].map((field) => (
          <label
            key={field.name}
            className={field.name === 'notes' ? 'wide' : ''}
          >
            <span>
              {t(field.label)}
              {field.required ? ' *' : ''}
            </span>
            {field.checkbox ? (
              <input
                type="checkbox"
                name={field.name}
                defaultChecked={
                  typeof values[field.name] === 'boolean'
                    ? values[field.name]
                    : field.name === 'active'
                }
              />
            ) : field.options ? (
              <select
                name={field.name}
                defaultValue={String(values[field.name] ?? field.options[0])}
                aria-invalid={invalid.includes(field.name)}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option
                      ? t(`customers.${option}` as TranslationKey)
                      : t('customers.none')}
                  </option>
                ))}
              </select>
            ) : field.name === 'notes' ? (
              <textarea
                name={field.name}
                defaultValue={String(values[field.name] ?? '')}
                maxLength={field.max}
                rows={3}
                aria-invalid={invalid.includes(field.name)}
              />
            ) : (
              <input
                name={field.name}
                defaultValue={String(values[field.name] ?? '')}
                required={field.required}
                maxLength={field.max}
                type={
                  field.name.toLowerCase().includes('email') ? 'email' : 'text'
                }
                aria-invalid={invalid.includes(field.name)}
              />
            )}
          </label>
        ))}
      </fieldset>
      <p className="customer-hint">
        {t(
          kind === 'customer'
            ? 'customers.identifierHint'
            : 'customers.primaryHint',
        )}
      </p>
      {invalid.length > 0 && <p role="alert">{t('customers.invalid')}</p>}
      <div className="customer-actions">
        <button disabled={busy} type="submit">
          {t('customers.save')}
        </button>
        <button disabled={busy} type="button" onClick={onCancel}>
          {t('customers.cancel')}
        </button>
      </div>
    </form>
  );
}
