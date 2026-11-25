'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { translate, type Locale, type TranslationKey } from '@rental/i18n';
import { administrationAccountSchema } from '@rental/validation';
import { accountResponse, invalidateAccount } from '../lib/account';

const languageEvent = 'rental-language';
const readLanguage = (): Locale =>
  localStorage.getItem(languageEvent) === 'tr' ? 'tr' : 'en';
const serverLanguage = (): Locale => 'en';
function subscribeLanguage(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(languageEvent, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(languageEvent, listener);
  };
}
function writeLanguage(value: Locale) {
  localStorage.setItem(languageEvent, value);
  window.dispatchEvent(new Event(languageEvent));
}
type Account = ReturnType<typeof administrationAccountSchema.parse>;
const Context = createContext<{
  locale: Locale;
  setLocale: (v: Locale) => void;
  org: string;
  account: Account | null;
}>({ locale: 'en', setLocale: () => {}, org: '', account: null });
export const useApplication = () => useContext(Context);
export function useAppLocale(): [Locale, (v: Locale) => void] {
  const c = useApplication();
  return [c.locale, c.setLocale];
}
const destinations = [
  ['dashboard', '/dashboard', null],
  ['customers', '/customers', 'customers.read'],
  ['machines', '/machines', 'machines.read'],
  ['rentals', '/rentals', 'rentals.read'],
  ['maintenance', '/maintenance', 'maintenance.read'],
  ['devices', '/devices', 'device.read'],
  ['finance', '/finance', 'finance.analytics.view'],
  ['settings', '/settings', null],
] as const;
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const [account, A] = useState<Account | null>(null),
    [error, E] = useState(false),
    [loading, B] = useState(true),
    [revision, R] = useState(0);
  const locale = useSyncExternalStore(
      subscribeLanguage,
      readLanguage,
      serverLanguage,
    ),
    L = writeLanguage;
  const t = (key: string) =>
    translate(locale, ('ops.' + key) as TranslationKey);
  const requested = params.get('organizationId') ?? '';
  const org =
    account?.organizations.find((o) => o.access?.organizationId === requested)
      ?.access?.organizationId ?? '';
  const selected = account?.organizations.find(
      (o) => o.access?.organizationId === org,
    ),
    permissions = selected?.access?.permissions ?? [];
  const href = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}organizationId=${encodeURIComponent(org)}`;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    let live = true;
    accountResponse()
      .then(async (r) => {
        if (!r.ok) throw Error();
        const data = administrationAccountSchema.parse(await r.json());
        if (live) {
          A(data);
          E(false);
          B(false);
        }
      })
      .catch(() => {
        if (live) {
          E(true);
          B(false);
        }
      });
    return () => {
      live = false;
    };
  }, [revision, pathname]);
  useEffect(() => {
    if (!account || pathname === '/' || loading) return;
    if (!requested) {
      const saved = sessionStorage.getItem('rental-organization');
      const first =
        account.organizations.find((o) => o.access?.organizationId === saved) ??
        account.organizations[0];
      if (first?.access) {
        const q = new URLSearchParams(params.toString());
        q.set('organizationId', first.access.organizationId);
        router.replace(`${pathname}?${q}`);
      }
    } else if (org) sessionStorage.setItem('rental-organization', org);
  }, [account, pathname, requested, org, loading, params, router]);
  function switchOrg(id: string) {
    // Destroy the old workspace and its drafts before exposing the new context.
    B(true);
    A(null);
    invalidateAccount();
    const base =
      destinations.find(
        ([, path]) => pathname === path || pathname.startsWith(path + '/'),
      )?.[1] ?? '/dashboard';
    router.push(`${base}?organizationId=${encodeURIComponent(id)}`);
    R((n) => n + 1);
  }
  const root = pathname === '/';
  return (
    <Context.Provider value={{ locale, setLocale: L, org, account }}>
      <a className="skip-link" href="#application-content">
        {t('skip')}
      </a>
      <header className="app-shell">
        <div className="app-bar">
          <Link className="app-brand" href={href('/dashboard')}>
            {translate(locale, 'app.title')}
          </Link>
          {account && (
            <label>
              {t('organization')}
              <select
                value={org}
                disabled={loading}
                onChange={(e) => switchOrg(e.target.value)}
              >
                {!org && <option value="">{t('chooseOrganization')}</option>}
                {account.organizations.flatMap((o) =>
                  o.access
                    ? [
                        <option
                          key={o.access.organizationId}
                          value={o.access.organizationId}
                        >
                          {o.name}
                        </option>,
                      ]
                    : [],
                )}
              </select>
            </label>
          )}
          <label>
            {t('language')}
            <select
              value={locale}
              onChange={(e) => L(e.target.value === 'tr' ? 'tr' : 'en')}
            >
              <option value="en">English</option>
              <option value="tr">Türkçe</option>
            </select>
          </label>
          {account ? (
            <>
              <Link href={href('/settings')}>{account.name}</Link>
              <a href="/auth/logout">{translate(locale, 'auth.logout')}</a>
            </>
          ) : (
            <a href="/auth/login">{translate(locale, 'auth.login')}</a>
          )}
        </div>
        {account && org && (
          <>
            <nav aria-label={t('navigation')} className="app-nav">
              {destinations
                .filter(([, path, p]) =>
                  path === '/finance'
                    ? (permissions.includes('finance.analytics.view') &&
                        permissions.includes('machines.read')) ||
                      (permissions.includes('finance.receivables.view') &&
                        permissions.includes('customers.read')) ||
                      (permissions.includes('finance.payables.view') &&
                        permissions.includes('machines.read') &&
                        permissions.includes('finance.acquisition_cost.view'))
                    : !p || permissions.includes(p),
                )
                .map(([key, path]) => (
                  <Link
                    key={path}
                    href={href(
                      path === '/finance' &&
                        !(
                          permissions.includes('finance.analytics.view') &&
                          permissions.includes('machines.read')
                        )
                        ? '/finance/records'
                        : path,
                    )}
                    aria-current={
                      pathname === path || pathname.startsWith(path + '/')
                        ? 'page'
                        : undefined
                    }
                  >
                    {t(key)}
                  </Link>
                ))}
              <Link
                href={href('/notifications')}
                aria-current={
                  pathname === '/notifications' ? 'page' : undefined
                }
              >
                {t('notifications')}
              </Link>
            </nav>
            <form className="global-search" action="/search">
              <input type="hidden" name="organizationId" value={org} />
              <label>
                {t('globalSearch')}
                <input
                  name="q"
                  type="search"
                  maxLength={200}
                  required
                  placeholder={t('searchHint')}
                />
              </label>
              <button>{t('searchAll')}</button>
            </form>
          </>
        )}
      </header>
      <div id="application-content" tabIndex={-1} key={`${pathname}:${org}`}>
        {root ? (
          children
        ) : loading ? (
          <main>
            <p role="status">{t('loading')}</p>
          </main>
        ) : error ? (
          <main>
            <p role="alert">{t('sessionError')}</p>
            <Link href="/">{t('accountOnboarding')}</Link>
            <a href="/auth/login">{translate(locale, 'auth.login')}</a>
            <button
              onClick={() => {
                B(true);
                invalidateAccount();
                R((n) => n + 1);
              }}
            >
              {t('retry')}
            </button>
          </main>
        ) : !org && (pathname !== '/settings' || !!requested) ? (
          <main>
            <h1>{t('dashboard')}</h1>
            <p role="status">
              {requested ? t('invalidOrganization') : t('noOrganization')}
            </p>
          </main>
        ) : (
          children
        )}
      </div>
    </Context.Provider>
  );
}
