'use client';
import { translate, type Locale } from '@rental/i18n';
import type { RentalTransportView, Tax } from '@rental/validation';
import { TaxFields, TaxSummary } from '../tax-fields';
import { CurrencySelect } from '../currency-select';

export type TransportDraft = {
  currency: string;
  customerPrice: string;
  customerTax: Tax;
  supplierName: string;
  supplierAmount: string;
  supplierTax: Tax;
};
export const transportDraft = (
  q: RentalTransportView | null,
): TransportDraft => ({
  currency: q?.currency ?? 'TRY',
  customerPrice: q?.customerPrice ?? '',
  customerTax: q?.customerTax ?? { mode: 'UNSPECIFIED' },
  supplierName: q?.supplierQuote?.name ?? '',
  supplierAmount: q?.supplierQuote?.amount ?? '',
  supplierTax: q?.supplierQuote?.tax ?? { mode: 'UNSPECIFIED' },
});
export function TransportEditor({
  enabled,
  toggle,
  value,
  change,
  costs,
  locale,
}: {
  enabled: boolean;
  toggle: (enabled: boolean) => void;
  value: TransportDraft;
  change: (next: TransportDraft) => void;
  costs: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <fieldset className="rental-panel">
      <legend>{t('transport.title')}</legend>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
        />
        {t('transport.include')}
      </label>
      {enabled && (
        <>
          <p>{t('transport.hint')}</p>
          <label>
            {t('rentals.currency')}
            <CurrencySelect
              locale={locale}
              value={value.currency}
              required
              onChange={(e) => change({ ...value, currency: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>{t('transport.customer')}</legend>
            <label>
              {t('transport.customer')}
              <input
                required
                inputMode="decimal"
                value={value.customerPrice}
                onChange={(e) =>
                  change({ ...value, customerPrice: e.target.value })
                }
              />
            </label>
            <TaxFields
              locale={locale}
              value={value.customerTax}
              required
              onChange={(tax) => change({ ...value, customerTax: tax })}
            />
          </fieldset>
          {costs && (
            <fieldset>
              <legend>{t('transport.supplier')}</legend>
              <label>
                {t('transport.supplierName')}
                <input
                  maxLength={200}
                  value={value.supplierName}
                  onChange={(e) =>
                    change({ ...value, supplierName: e.target.value })
                  }
                />
              </label>
              <label>
                {t('transport.supplierCost')}
                <input
                  inputMode="decimal"
                  value={value.supplierAmount}
                  onChange={(e) =>
                    change({ ...value, supplierAmount: e.target.value })
                  }
                />
              </label>
              <p>{t('transport.unknownHint')}</p>
              {value.supplierAmount && (
                <TaxFields
                  locale={locale}
                  value={value.supplierTax}
                  required
                  onChange={(tax) => change({ ...value, supplierTax: tax })}
                />
              )}
            </fieldset>
          )}
          <p>{t('transport.estimateHint')}</p>
        </>
      )}
    </fieldset>
  );
}
export function TransportDetails({
  quote,
  locale,
}: {
  quote: RentalTransportView | null;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  if (!quote) return <p>{t('transport.none')}</p>;
  const currency = quote.currency ? t(`currency.${quote.currency}`) : '';
  return (
    <>
      {quote.customerPrice !== undefined && (
        <p>
          {t('transport.customer')}: {quote.customerPrice} {currency} ·{' '}
          <TaxSummary tax={quote.customerTax} locale={locale} />
        </p>
      )}
      {quote.supplierQuote !== undefined && (
        <p>
          {t('transport.supplierCost')}:{' '}
          {quote.supplierQuote ? (
            <>
              {quote.supplierQuote.amount} {currency} ·{' '}
              {quote.supplierQuote.name} ·{' '}
              <TaxSummary tax={quote.supplierQuote.tax} locale={locale} />
            </>
          ) : (
            t('finance.unknown')
          )}
        </p>
      )}
      {quote.customerPrice !== undefined &&
        quote.supplierQuote !== undefined && (
          <p>
            {t('transport.margin')}:{' '}
            {quote.estimatedMargin ?? t('finance.unknown')}{' '}
            {quote.estimatedMargin !== undefined && currency}
          </p>
        )}
    </>
  );
}
