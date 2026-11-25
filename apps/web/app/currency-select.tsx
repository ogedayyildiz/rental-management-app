import type { SelectHTMLAttributes } from 'react';
import {
  translate,
  selectableCurrencies,
  isSelectableCurrency,
  type Locale,
} from '@rental/i18n';

type Props = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children' | 'multiple' | 'value' | 'defaultValue'
> & {
  locale: Locale;
  emptyLabel?: string;
  value?: string;
  defaultValue?: string;
};

export function CurrencySelect({ locale, emptyLabel, ...props }: Props) {
  const current = props.value ?? props.defaultValue ?? '';
  return (
    <select {...props}>
      <option value="">
        {emptyLabel ?? translate(locale, 'currency.choose')}
      </option>
      {/* Preserve an existing historical code on unrelated edits, without offering it as a new choice. */}
      {current && !isSelectableCurrency(current) && (
        <option value={current} hidden>
          {current}
        </option>
      )}
      {selectableCurrencies.map((currency) => (
        <option key={currency} value={currency}>
          {translate(locale, `currency.${currency}`)}
        </option>
      ))}
    </select>
  );
}
