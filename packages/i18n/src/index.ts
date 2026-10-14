export const messages = {
  en: {
    'auth.login': 'Log in',
    'auth.logout': 'Log out',
    'auth.currentUser': 'Check application access',
    'auth.invitation': 'Invitation token',
    'auth.accept': 'Accept invitation',
    'auth.success': 'Request completed.',
    'auth.failed':
      'Request failed. Check your sign-in and invitation, then try again.',
    'auth.configurationRequired': 'Authentication configuration is required.',
    'app.title': 'Rental Management',
    'common.notFound': 'Page not found.',
    'bootstrap.description':
      'The workspace is ready. Business features will be added in the next phase.',
  },
  tr: {
    'auth.login': 'Giriş yap',
    'auth.logout': 'Çıkış yap',
    'auth.currentUser': 'Uygulama erişimini kontrol et',
    'auth.invitation': 'Davet kodu',
    'auth.accept': 'Daveti kabul et',
    'auth.success': 'İşlem tamamlandı.',
    'auth.failed':
      'İşlem başarısız. Girişinizi ve davetinizi kontrol edip tekrar deneyin.',
    'auth.configurationRequired': 'Kimlik doğrulama yapılandırması gerekiyor.',
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
