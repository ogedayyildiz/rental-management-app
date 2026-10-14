export const messages = {
  en: {
    'app.title': 'Rental Management',
    'common.notFound': 'Page not found.',
    'bootstrap.description':
      'The workspace is ready. Business features will be added in the next phase.',
  },
  tr: {
    'app.title': 'Kiralama Yönetimi',
    'common.notFound': 'Sayfa bulunamadı.',
    'bootstrap.description':
      'Çalışma alanı hazır. İş özellikleri sonraki aşamada eklenecek.',
  },
} as const;

export type Locale = keyof typeof messages;
export type TranslationKey = keyof typeof messages.en;

export function translate(locale: Locale, key: TranslationKey): string {
  return messages[locale][key];
}
