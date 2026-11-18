'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { translate, type Locale, type TranslationKey } from '@rental/i18n';
import { administrationAccountSchema } from '@rental/validation';
import { SettingsPanel } from './panel';
export type Context = ReturnType<
  typeof administrationAccountSchema.parse
>['organizations'][number];
export const sections: Record<string, string> = {
  organization: 'organization.manage',
  users: 'users.manage',
  roles: 'roles.manage',
  branches: 'branches.manage',
  invitations: 'users.manage',
  audit: 'audit.read',
};
export function SettingsWorkspace({
  section,
  initialOrg,
}: {
  section: string;
  initialOrg: string;
}) {
  const [locale, L] = useState<Locale>('en'),
    [org, O] = useState(initialOrg),
    [data, D] = useState<ReturnType<
      typeof administrationAccountSchema.parse
    > | null>(null),
    [account, A] = useState({ name: '', email: '' }),
    [error, E] = useState(false),
    [revision, R] = useState(0);
  const t = (k: string) => translate(locale, ('admin.' + k) as TranslationKey);
  useEffect(() => {
    let live = true;
    void fetch('/api/backend/me', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const v: unknown = await r.json();
        const parsed = administrationAccountSchema.parse(v);
        if (!live) return;
        D(parsed);
        if (v && typeof v === 'object')
          A({
            name: 'name' in v && typeof v.name === 'string' ? v.name : '',
            email: 'email' in v && typeof v.email === 'string' ? v.email : '',
          });
        O((current) =>
          parsed.organizations.some((x) => x.access?.organizationId === current)
            ? current
            : (parsed.organizations[0]?.access?.organizationId ?? ''),
        );
      })
      .catch(() => {
        if (live) E(true);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  const context = data?.organizations.find(
      (x) => x.access?.organizationId === org,
    ),
    access = context?.access;
  const can = (s: string) =>
    !!access &&
    access.permissions.includes(sections[s] ?? '') &&
    (s === 'branches' || access.branchScope === 'ALL_BRANCHES');
  function refresh() {
    D(null);
    E(false);
    R((n) => n + 1);
  }
  function switchOrg(id: string) {
    O(id);
    D(null);
    E(false);
    R((n) => n + 1);
    window.history.replaceState(
      null,
      '',
      `/settings${section === 'account' ? '' : '/' + section}?organizationId=${encodeURIComponent(id)}`,
    );
  }
  return (
    <main className="customer-workspace">
      <header>
        <h1>{t('title')}</h1>
        <Link href="/">{t('home')}</Link>
        <label>
          {t('language')}
          <select value={locale} onChange={(e) => L(e.target.value as Locale)}>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </label>
      </header>
      {error && <p role="alert">{t('error')}</p>}
      {!data && !error && <p role="status">{t('loading')}</p>}
      {data && (
        <>
          <div className="customer-toolbar">
            <label>
              {t('activeOrganization')}
              <select value={org} onChange={(e) => switchOrg(e.target.value)}>
                {data.organizations.map(
                  (x) =>
                    x.access && (
                      <option
                        key={x.access.organizationId}
                        value={x.access.organizationId}
                      >
                        {x.name}
                      </option>
                    ),
                )}
              </select>
            </label>
            <button onClick={refresh}>{t('refresh')}</button>
          </div>
          <p className="customer-hint">{t('unsaved')}</p>
          <nav className="settings-nav">
            <Link
              href={`/settings?organizationId=${org}`}
              aria-current={section === 'account' ? 'page' : undefined}
            >
              {t('account')}
            </Link>
            {Object.keys(sections)
              .filter(can)
              .map((s) => (
                <Link
                  key={s}
                  href={`/settings/${s}?organizationId=${org}`}
                  aria-current={s === section ? 'page' : undefined}
                >
                  {t(s)}
                </Link>
              ))}
          </nav>
          {!access ? (
            <p>{t('noOrganizations')}</p>
          ) : section === 'account' ? (
            <section className="customer-panel settings-context">
              <h2>{t('account')}</h2>
              <p>
                {account.name} · {account.email}
              </p>
              <dl>
                <div>
                  <dt>{t('activeOrganization')}</dt>
                  <dd>{context?.name}</dd>
                </div>
                <div>
                  <dt>{t('scope')}</dt>
                  <dd>
                    {t(access.branchScope)}
                    {access.branchScope === 'SELECTED_BRANCHES' && (
                      <p>{access.branchIds.join(', ') || t('emptyScope')}</p>
                    )}
                  </dd>
                </div>
              </dl>
              <h3>{t('memberships')}</h3>
              <ul>
                {data.organizations.map((x) => (
                  <li key={x.access?.organizationId}>{x.name}</li>
                ))}
              </ul>
              <h3>{t('permissions')}</h3>
              <ul>
                {access.permissions.map((k) => (
                  <li key={k}>
                    {t('permission.' + k)} <code>{k}</code>
                  </li>
                ))}
              </ul>
              <nav className="settings-nav">
                {[
                  ['customers', 'customers.read'],
                  ['machines', 'machines.read'],
                  ['rentals', 'rentals.read'],
                  ['maintenance', 'maintenance.read'],
                  ['finance', 'finance.analytics.view'],
                ]
                  .filter(([, p]) => access.permissions.includes(p!))
                  .map(([path]) => (
                    <Link key={path} href={`/${path}?organizationId=${org}`}>
                      {translate(locale, `${path}.title` as TranslationKey)}
                    </Link>
                  ))}
              </nav>
            </section>
          ) : can(section) ? (
            <SettingsPanel
              key={`${org}:${section}:${revision}`}
              section={section}
              context={context!}
              locale={locale}
              refreshContext={refresh}
            />
          ) : (
            <p role="alert">{t('noAccess')}</p>
          )}
        </>
      )}
    </main>
  );
}
