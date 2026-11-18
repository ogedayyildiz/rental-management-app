'use client';
import { useEffect, useState } from 'react';
import { translate, type Locale, type TranslationKey } from '@rental/i18n';
import { machineAccessSchema } from '@rental/validation';
import { deviceHttp } from './http';
type Device = {
  id: string;
  provider: string;
  providerDeviceId: string;
  deviceModel: string | null;
  installations: {
    id: string;
    machineId: string;
    installedAt: string;
    removedAt: string | null;
    machine: { fleetNumber: string };
  }[];
};
type Org = { id: string; name: string; permissions: string[]; all: boolean };
export default function Devices() {
  const [locale, L] = useState<Locale>('en'),
    [orgs, O] = useState<Org[]>([]),
    [org, S] = useState(''),
    [devices, D] = useState<Device[]>([]),
    [selected, V] = useState<Device | null>(null),
    [machines, M] = useState<{ id: string; fleetNumber: string }[]>([]),
    [version, R] = useState(0),
    [error, E] = useState(false);
  const t = (k: TranslationKey) => translate(locale, k),
    can = (p: string) =>
      orgs.find((x) => x.id === org)?.permissions.includes(p);
  useEffect(() => {
    void fetch('/api/backend/me')
      .then((r) => r.json())
      .then((v) => {
        const list = machineAccessSchema.parse(v).organizations.flatMap((o) =>
          o.access?.permissions.includes('device.read')
            ? [
                {
                  id: o.access.organizationId,
                  name: o.name,
                  permissions: o.access.permissions,
                  all: o.access.branchScope === 'ALL_BRANCHES',
                },
              ]
            : [],
        );
        O(list);
        S(list[0]?.id ?? '');
      })
      .catch(() => E(true));
  }, []);
  useEffect(() => {
    if (!org) return;
    let alive = true;
    void deviceHttp<Device[]>(org, 'devices')
      .then((x) => {
        if (alive) D(x);
      })
      .catch(() => {
        if (alive) E(true);
      });
    if (orgs.find((x) => x.id === org)?.permissions.includes('machines.read'))
      void deviceHttp<{ items: { id: string; fleetNumber: string }[] }>(
        org,
        'machines?limit=100',
      )
        .then((x) => {
          if (alive) M(x.items);
        })
        .catch(() => {
          if (alive) E(true);
        });
    return () => {
      alive = false;
    };
  }, [org, orgs, version]);
  async function show(id: string) {
    V(await deviceHttp<Device>(org, 'devices/' + id));
  }
  async function run(f: () => Promise<void>) {
    E(false);
    try {
      await f();
      R((n) => n + 1);
    } catch {
      E(true);
    }
  }
  const active = selected?.installations.find((i) => !i.removedAt);
  return (
    <main>
      <h1>{t('iot.devices')}</h1>
      <select
        aria-label={t('iot.language')}
        value={locale}
        onChange={(e) => L(e.target.value as Locale)}
      >
        <option value="en">English</option>
        <option value="tr">Türkçe</option>
      </select>
      <select
        aria-label={t('iot.organization')}
        value={org}
        onChange={(e) => {
          V(null);
          D([]);
          M([]);
          S(e.target.value);
        }}
      >
        {orgs.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      {error && <p role="alert">{t('auth.failed')}</p>}
      {can('device.manage') && orgs.find((x) => x.id === org)?.all && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              const d = await deviceHttp<Device>(org, 'devices', 'POST', {
                provider: f.get('provider'),
                providerDeviceId: f.get('key'),
              });
              await show(d.id);
            });
          }}
        >
          <label>
            {t('iot.provider')}
            <input name="provider" required />
          </label>
          <label>
            {t('iot.external')}
            <input name="key" required />
          </label>
          <button>{t('iot.register')}</button>
        </form>
      )}
      <ul>
        {devices.map((d) => (
          <li key={d.id}>
            <button onClick={() => void run(() => show(d.id))}>
              {d.provider} · {d.providerDeviceId}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <section key={selected.id}>
          <h2>{selected.providerDeviceId}</h2>
          {can('device.assign') && (!active || can('device.remove')) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const machineId = new FormData(e.currentTarget).get('machine');
                void run(async () => {
                  await deviceHttp(
                    org,
                    'devices/' +
                      selected.id +
                      '/' +
                      (active ? 'move' : 'install'),
                    'POST',
                    { machineId },
                  );
                  await show(selected.id);
                });
              }}
            >
              <label>
                {t('iot.target')}
                <select required name="machine" defaultValue="">
                  <option value=""></option>
                  {machines
                    .filter((m) => m.id !== active?.machineId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fleetNumber}
                      </option>
                    ))}
                </select>
              </label>
              <button>{t(active ? 'iot.move' : 'iot.install')}</button>
            </form>
          )}
          {active && can('device.remove') && (
            <button
              onClick={() =>
                void run(async () => {
                  await deviceHttp(
                    org,
                    'devices/' + selected.id + '/remove',
                    'POST',
                    {},
                  );
                  V(null);
                })
              }
            >
              {t('iot.remove')}
            </button>
          )}
          <h3>{t('iot.installations')}</h3>
          <ul>
            {selected.installations.map((i) => (
              <li key={i.id}>
                {i.machine.fleetNumber} · {i.installedAt} →{' '}
                {i.removedAt ?? t('iot.installed')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
