// Selection policy only; historical records may retain other ISO currency codes.
export const selectableCurrencies = ['TRY', 'USD', 'EUR'] as const;

export function isSelectableCurrency(value: string): boolean {
  return selectableCurrencies.some((currency) => currency === value);
}

export const currencyMessages = {
  en: {
    'currency.choose': 'Choose currency…',
    'currency.TRY': 'TL',
    'currency.USD': 'USD',
    'currency.EUR': 'EUR',
  },
  tr: {
    'currency.choose': 'Para birimi seçiniz…',
    'currency.TRY': 'TL',
    'currency.USD': 'USD',
    'currency.EUR': 'EUR',
  },
} as const;
