'use client';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as LocationMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { translate, type Locale, type TranslationKey } from '@rental/i18n';
import { signalNames, type Signal } from '@rental/validation';
import { deviceHttp } from './http';
type Location = { latitude: number; longitude: number };
type Reading = {
  signal: Signal;
  value: number | string | boolean | Location;
  recorded: string;
  stale?: boolean;
  device: string;
};
type State = {
  connectivity: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  lastUpdate: string | null;
  signals: Reading[];
  faults?: { code: string; device: string }[];
};
function MapPoint({ point, label }: { point: Location; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const { latitude, longitude } = point;
  useEffect(() => {
    let alive = true;
    let map: LocationMap | undefined;
    void import('maplibre-gl')
      .then(({ Map, Marker, setWorkerUrl }) => {
        if (!el.current || !alive) return;
        setWorkerUrl('/map/maplibre-gl-worker.mjs');
        map = new Map({
          container: el.current,
          center: [longitude, latitude],
          zoom: 5,
          style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || {
            version: 8,
            sources: {
              countries: {
                type: 'geojson',
                data: '/map/countries.geojson',
                attribution: 'Natural Earth',
              },
            },
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': '#dbe9f2' },
              },
              {
                id: 'land',
                source: 'countries',
                type: 'fill',
                paint: {
                  'fill-color': '#e4eadb',
                  'fill-outline-color': '#77886b',
                },
              },
            ],
          },
        });
        map.once('load', () =>
          el.current?.setAttribute('data-map-ready', 'true'),
        );
        new Marker().setLngLat([longitude, latitude]).addTo(map);
      })
      .catch(() => {
        /* The coordinates remain accessible without WebGL. */
      });
    return () => {
      alive = false;
      map?.remove();
    };
  }, [latitude, longitude]);
  return <div aria-label={label} role="img" ref={el} style={{ height: 220 }} />;
}
export function MachineTelemetry({
  org,
  id,
  locale,
}: {
  org: string;
  id: string;
  locale: Locale;
}) {
  const [state, S] = useState<State | null>(null),
    [rows, H] = useState<Reading[] | null>(null),
    [version, R] = useState(0),
    [error, E] = useState(false);
  const t = (k: TranslationKey) => translate(locale, k);
  const [openedAt] = useState(() => Date.now());
  const [observedAt, O] = useState(() => Date.now());
  const path = 'machines/' + id + '/telemetry';
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const v = await deviceHttp<State>(org, path);
        if (alive) {
          S(v);
          O(Date.now());
          E(false);
        }
      } catch {
        if (alive) {
          S(null);
          E(true);
        }
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [org, path, version]);
  const value = (r: Reading) =>
    typeof r.value === 'object'
      ? r.value.latitude + ', ' + r.value.longitude
      : String(r.value);
  return (
    <section aria-label={t('iot.telemetry')}>
      <h3>{t('iot.telemetry')}</h3>
      {error && <p role="alert">{t('ops.networkError')}</p>}
      <button onClick={() => R((x) => x + 1)}>{t('iot.refresh')}</button>
      {state && (
        <>
          <strong>{t(('iot.' + state.connectivity) as TranslationKey)}</strong>{' '}
          {state.lastUpdate && (
            <time dateTime={state.lastUpdate}>{state.lastUpdate}</time>
          )}
          {state.lastUpdate && (
            <p>
              {t('ops.age')}:{' '}
              {Math.max(
                0,
                Math.floor((observedAt - Date.parse(state.lastUpdate)) / 60000),
              )}
            </p>
          )}
          <dl>
            {state.signals.map((r) => (
              <div key={r.signal}>
                <dt>{t(('iot.' + r.signal) as TranslationKey)}</dt>
                <dd>
                  {value(r)} · {t(r.stale ? 'iot.stale' : 'ops.recent')}{' '}
                  {r.recorded}
                </dd>
                {r.signal === 'location' && typeof r.value === 'object' && (
                  <MapPoint point={r.value} label={t('iot.map')} />
                )}
              </div>
            ))}
          </dl>
          {state.faults && (
            <div>
              {t('iot.faults')}:{' '}
              {state.faults.map((f) => f.code).join(', ') || '—'}
            </div>
          )}
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const q = new URLSearchParams({
            from: new Date(String(f.get('from')) + 'T00:00:00Z').toISOString(),
            to: new Date(String(f.get('to')) + 'T00:00:00Z').toISOString(),
            signals: String(f.get('signal')),
          });
          void deviceHttp<Reading[]>(org, path + '/history?' + q)
            .then(H)
            .catch(() => E(true));
        }}
      >
        <label>
          {t('iot.from')}
          <input
            name="from"
            type="date"
            required
            defaultValue={new Date(openedAt - 86400000)
              .toISOString()
              .slice(0, 10)}
          />
        </label>
        <label>
          {t('iot.to')}
          <input
            name="to"
            type="date"
            required
            defaultValue={new Date(openedAt + 86400000)
              .toISOString()
              .slice(0, 10)}
          />
        </label>
        <select aria-label={t('iot.signal')} name="signal">
          {signalNames.map((s) => (
            <option value={s} key={s}>
              {t(('iot.' + s) as TranslationKey)}
            </option>
          ))}
        </select>
        <button>{t('iot.history')}</button>
      </form>
      {rows && (
        <ul aria-label={t('iot.history')}>
          {rows.map((r) => (
            <li key={r.device + r.recorded + r.signal}>
              {r.recorded} · {value(r)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
