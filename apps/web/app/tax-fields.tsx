'use client';
import { useState } from 'react';
import { translate, type Locale } from '@rental/i18n';
import type { Tax } from '@rental/validation';

export function taxFormValue(form: FormData): unknown {
  const mode = String(form.get('taxMode') || 'UNSPECIFIED');
  return {
    mode,
    ...(mode === 'EXCLUSIVE' || mode === 'INCLUSIVE'
      ? { rate: String(form.get('taxRate') ?? '') }
      : mode === 'NOT_APPLICABLE'
        ? { reason: String(form.get('taxReason') ?? '') }
        : {}),
  };
}
export function TaxFields({
  locale,
  value,
  defaultValue,
  onChange,
  required = false,
}: {
  locale: Locale;
  value?: Tax;
  defaultValue?: Tax | undefined;
  onChange?: (tax: Tax) => void;
  required?: boolean;
}) {
  const [local, S] = useState<Tax>(defaultValue ?? { mode: 'UNSPECIFIED' }),
    tax = value ?? local;
  function change(next: Tax) {
    S(next);
    onChange?.(next);
  }
  return (
    <fieldset className="tax-fields">
      <legend>{translate(locale, 'tax.title')}</legend>
      <label>
        {translate(locale, 'tax.title')}
        <select
          name="taxMode"
          required={required}
          value={tax.mode === 'UNSPECIFIED' ? '' : tax.mode}
          onChange={(e) => {
            const mode = e.target.value as Tax['mode'];
            change(
              mode === 'EXCLUSIVE' || mode === 'INCLUSIVE'
                ? { mode, rate: 'rate' in tax ? tax.rate : '' }
                : mode === 'NOT_APPLICABLE'
                  ? { mode, reason: 'reason' in tax ? tax.reason : '' }
                  : { mode: 'UNSPECIFIED' },
            );
          }}
        >
          <option value="">{translate(locale, 'tax.UNSPECIFIED')}</option>
          {(['EXCLUSIVE', 'INCLUSIVE', 'NOT_APPLICABLE'] as const).map(
            (mode) => (
              <option value={mode} key={mode}>
                {translate(locale, `tax.${mode}`)}
              </option>
            ),
          )}
        </select>
      </label>
      {'rate' in tax && (
        <label>
          {translate(locale, 'tax.rate')}
          <input
            name="taxRate"
            inputMode="decimal"
            required
            value={tax.rate}
            onChange={(e) => change({ ...tax, rate: e.target.value })}
          />
        </label>
      )}
      {'reason' in tax && (
        <label>
          {translate(locale, 'tax.reason')}
          <input
            name="taxReason"
            required
            maxLength={1000}
            value={tax.reason}
            onChange={(e) => change({ ...tax, reason: e.target.value })}
          />
        </label>
      )}
    </fieldset>
  );
}
export function TaxSummary({
  tax,
  locale,
}: {
  tax: Tax | undefined;
  locale: Locale;
}) {
  return (
    <span>
      {translate(locale, `tax.${tax?.mode ?? 'UNSPECIFIED'}`)}
      {tax && 'rate' in tax
        ? ` (${tax.rate}%)`
        : tax && 'reason' in tax
          ? `: ${tax.reason}`
          : ''}
    </span>
  );
}
