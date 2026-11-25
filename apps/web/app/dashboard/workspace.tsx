'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createOperationsClient, OperationsError } from '@rental/api-client';
import type {
  Attention,
  OperationsDashboard,
  NotificationPreferences,
} from '@rental/validation';
import { translate, type TranslationKey } from '@rental/i18n';
import { useApplication } from '../app-shell';
const api = createOperationsClient('/api/backend');
const focusKinds: Record<string, string[]> = {
  reservationsSoon: ['RESERVATION_SOON', 'DISPATCH_DUE'],
  returnsToday: ['RETURN_TODAY', 'RETURN_OVERDUE'],
  overdueRentals: ['RETURN_OVERDUE'],
  maintenanceMachines: ['SERVICE_BLOCKED'],
  offlineMachines: ['TELEMETRY_OFFLINE'],
  activeFaults: ['TELEMETRY_FAULT'],
};
export function OperationsWorkspace({
  notifications = false,
}: {
  notifications?: boolean;
}) {
  const { locale, org, account } = useApplication(),
    params = useSearchParams();
  const [response, D] = useState<OperationsDashboard | null>(null),
    [branch, B] = useState(params.get('branchId') ?? ''),
    [saving, S] = useState(false),
    [errorText, E] = useState(''),
    [loaded, K] = useState(''),
    [version, V] = useState(0),
    [domain, Domain] = useState(''),
    [unread, U] = useState(false);
  const requestKey = org + ':' + branch + ':' + version;
  const busy = saving || loaded !== requestKey,
    data = loaded === requestKey ? response : null,
    error = loaded === requestKey ? errorText : '';
  const t = (k: string) => translate(locale, ('ops.' + k) as TranslationKey);
  const access = account?.organizations.find(
    (o) => o.access?.organizationId === org,
  )?.access;
  const can = (key: string) => access?.permissions.includes(key) ?? false;
  const link = (path: string) =>
    `${path}${path.includes('?') ? '&' : '?'}organizationId=${org}`;
  useEffect(() => {
    if (!org) return;
    let live = true;
    api
      .dashboard(org, branch)
      .then((v) => {
        if (live) {
          D(v);
          E('');
        }
      })
      .catch((e) => {
        if (live) {
          D(null);
          E(e instanceof OperationsError ? e.code : 'NETWORK_ERROR');
        }
      })
      .finally(() => {
        if (live) {
          K(requestKey);
          S(false);
        }
      });
    return () => {
      live = false;
    };
  }, [org, branch, requestKey]);
  const fail = (e: unknown) =>
    E(e instanceof OperationsError ? e.code : 'NETWORK_ERROR');
  async function action(
    item: Attention,
    kind: 'READ' | 'UNREAD' | 'ACKNOWLEDGE' | 'DISMISS',
  ) {
    if (kind === 'DISMISS' && !window.confirm(t('dismissConfirm'))) return;
    S(true);
    E('');
    try {
      await api.interact(org, item.key, kind);
      V((n) => n + 1);
    } catch (e) {
      fail(e);
      S(false);
    }
  }
  async function preferences(value: NotificationPreferences) {
    S(true);
    E('');
    try {
      await api.preferences(org, value);
      V((n) => n + 1);
    } catch (e) {
      fail(e);
      S(false);
    }
  }
  const date = (v: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: data?.timezone ?? 'UTC',
    }).format(new Date(v));
  function rows(items: Attention[], controls = false) {
    return items.length ? (
      <ul className="operations-events">
        {items.map((item) => (
          <li key={item.key} data-testid="attention-item">
            <div>
              <span
                className={`attention-severity severity-${item.severity.toLowerCase()}`}
              >
                {t(item.severity)}
              </span>{' '}
              <strong>{t(item.kind)}</strong> · {t(item.domain)}
            </div>
            <Link
              href={item.href}
              onClick={() => {
                if (controls && !item.readAt)
                  void api.interact(org, item.key, 'READ').catch(() => {});
              }}
            >
              {item.label}
            </Link>
            {item.detail && (
              <span>
                {' '}
                ·{' '}
                {item.kind === 'SERVICE_BLOCKED'
                  ? translate(
                      locale,
                      ('machines.' + item.detail) as TranslationKey,
                    )
                  : item.detail}
              </span>
            )}
            <p>
              <time dateTime={item.at}>{date(item.at)}</time>
            </p>
            {controls && (
              <div className="operations-actions">
                <span>
                  {t(item.readAt ? 'read' : 'unread')}
                  {item.acknowledgedAt ? ' · ' + t('acknowledged') : ''}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(item, item.readAt ? 'UNREAD' : 'READ')
                  }
                >
                  {t(item.readAt ? 'markUnread' : 'markRead')}
                </button>
                <button
                  disabled={busy || !!item.acknowledgedAt}
                  onClick={() => void action(item, 'ACKNOWLEDGE')}
                >
                  {t('acknowledge')}
                </button>
                <button
                  disabled={busy}
                  onClick={() => void action(item, 'DISMISS')}
                >
                  {t('dismiss')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <p role="status">{t('empty')}</p>
    );
  }
  const attention =
    data?.attention.filter((a) => {
      const focus = params.get('focus');
      if (!focus) return true;
      if (!focusKinds[focus]?.includes(a.kind)) return false;
      const day = new Intl.DateTimeFormat('en-CA', {
        timeZone: data.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(a.at));
      return focus === 'returnsToday'
        ? day === data.today
        : focus === 'reservationsSoon'
          ? day >= data.today && day <= data.upcomingThrough
          : true;
    }) ?? [];
  return (
    <main className="operations-page">
      <header>
        <h1>{t(notifications ? 'notifications' : 'dashboard')}</h1>
        <button onClick={() => V((n) => n + 1)} disabled={busy}>
          {t('refresh')}
        </button>
      </header>
      {error && (
        <p role="alert">
          {t(
            error === 'ACCESS_DENIED'
              ? 'denied'
              : error === 'UNAUTHENTICATED'
                ? 'sessionError'
                : error === 'INVALID_INPUT'
                  ? 'narrow'
                  : error === 'NOT_FOUND'
                    ? 'resolved'
                    : 'networkError',
          )}
        </p>
      )}
      {busy && <p role="status">{t('loading')}</p>}
      {data && (
        <>
          <p>
            {t('asOf')} {date(data.generatedAt)} · {data.timezone}
          </p>
          <label>
            {t('branch')}
            <select value={branch} onChange={(e) => B(e.target.value)}>
              <option value="">{t('allAllowedBranches')}</option>
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {!notifications && (
            <>
              <section aria-label={t('metrics')} className="operations-metrics">
                {data.metrics.map((m) => (
                  <Link
                    key={m.key}
                    href={m.href}
                    className="operations-card"
                    aria-label={`${t(m.key)}: ${m.value}`}
                  >
                    <span>{t(m.key)}</span>
                    <strong>{m.value}</strong>
                  </Link>
                ))}
              </section>
              <p className="operations-hint">{t('capacityHint')}</p>
              <section>
                <h2>{t('quickActions')}</h2>
                <div className="operations-actions">
                  {can('rentals.create') &&
                    can('rentals.read') &&
                    can('customers.read') && (
                      <Link href={link('/rentals?create=1')}>
                        {t('createRental')}
                      </Link>
                    )}
                  {can('customers.create') && can('customers.read') && (
                    <Link href={link('/customers?create=1')}>
                      {t('addCustomer')}
                    </Link>
                  )}
                  {can('machines.create') && can('machines.read') && (
                    <Link href={link('/machines?create=1')}>
                      {t('addMachine')}
                    </Link>
                  )}
                  {can('maintenance.create') &&
                    can('maintenance.read') &&
                    can('machines.read') && (
                      <Link href={link('/maintenance?create=1')}>
                        {t('createWorkOrder')}
                      </Link>
                    )}
                  {can('device.manage') &&
                    can('device.read') &&
                    access?.branchScope === 'ALL_BRANCHES' && (
                      <Link href={link('/devices')}>{t('registerDevice')}</Link>
                    )}
                </div>
              </section>
              <section>
                <h2>{t('attention')}</h2>
                {params.get('focus') && (
                  <Link href={link('/dashboard')}>{t('showAll')}</Link>
                )}
                {rows(attention)}
                {data.attentionTotal > data.attention.length && (
                  <p>{t('limited')}</p>
                )}
              </section>
              <section>
                <h2>{t('today')}</h2>
                {rows(
                  data.timeline.filter(
                    (a) =>
                      new Intl.DateTimeFormat('en-CA', {
                        timeZone: data.timezone,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      }).format(new Date(a.at)) === data.today,
                  ),
                )}
              </section>
              <section>
                <h2>{t('upcoming')}</h2>
                {rows(
                  data.timeline.filter(
                    (a) =>
                      new Intl.DateTimeFormat('en-CA', {
                        timeZone: data.timezone,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      }).format(new Date(a.at)) !== data.today,
                  ),
                )}
                {data.timelineTotal > data.timeline.length && (
                  <p>{t('limited')}</p>
                )}
              </section>
            </>
          )}
          {notifications && (
            <>
              <p>{t('notificationHint')}</p>
              <p aria-live="polite">
                {t('unread')}: {data.unreadTotal}
              </p>
              <div className="operations-actions">
                <label>
                  {t('source')}
                  <select
                    value={domain}
                    onChange={(e) => Domain(e.target.value)}
                  >
                    <option value="">{t('all')}</option>
                    {(['RENTAL', 'MAINTENANCE', 'TELEMETRY'] as const).map(
                      (d) => (
                        <option key={d} value={d}>
                          {t(d)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={unread}
                    onChange={(e) => U(e.target.checked)}
                  />
                  {t('unreadOnly')}
                </label>
              </div>
              {rows(
                data.notifications.filter(
                  (a) =>
                    (!domain || a.domain === domain) && (!unread || !a.readAt),
                ),
                true,
              )}
              {data.notificationTotal > data.notifications.length && (
                <p>{t('limited')}</p>
              )}
              <section>
                <h2>{t('preferences')}</h2>
                <form
                  key={JSON.stringify(data.preferences)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void preferences({
                      enabled: f.has('enabled'),
                      domains: (
                        ['RENTAL', 'MAINTENANCE', 'TELEMETRY'] as const
                      ).filter((d) => f.has(d)),
                      lowSocPercent: Number(f.get('lowSocPercent')),
                    });
                  }}
                >
                  <fieldset disabled={busy}>
                    <legend>{t('inAppOnly')}</legend>
                    <label>
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={data.preferences.enabled}
                      />
                      {t('enabled')}
                    </label>
                    {(['RENTAL', 'MAINTENANCE', 'TELEMETRY'] as const).map(
                      (d) => (
                        <label key={d}>
                          <input
                            type="checkbox"
                            name={d}
                            defaultChecked={data.preferences.domains.includes(
                              d,
                            )}
                          />
                          {t(d)}
                        </label>
                      ),
                    )}
                    <label>
                      {t('lowSocThreshold')}
                      <input
                        type="number"
                        name="lowSocPercent"
                        min="0"
                        max="100"
                        step="1"
                        required
                        defaultValue={data.preferences.lowSocPercent}
                      />
                    </label>
                    <p>{t('lowSocHint')}</p>
                    <button>{t('savePreferences')}</button>
                  </fieldset>
                </form>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
