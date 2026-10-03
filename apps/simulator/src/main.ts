/**
 * Fake GPS fleet for development. Each device publishes JSON to
 * devices/{deviceId}/telemetry, the topic the "simulator" ingestion provider
 * subscribes to. Device ids match the machines created by `pnpm db:seed`.
 *
 * Behaviour per device: works on a site (ignition on, small moves), idles
 * (ignition off, charging when low), or occasionally drives between sites.
 * Error codes appear and clear at random.
 */
import { demoDeviceId, demoInitialEngineHours, seededRandom } from '@rental/shared';
import mqtt from 'mqtt';

const url = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const count = Number(process.env.SIM_DEVICE_COUNT ?? 50);
const intervalMs = Number(process.env.SIM_INTERVAL_MS ?? 5000);

const ERROR_CODES = ['I001', 'E101', 'E202', 'E305', 'E410'];
// Rough bounding box over Istanbul
const BOUNDS = { latMin: 40.95, latMax: 41.15, lonMin: 28.6, lonMax: 29.35 };

type Mode = 'working' | 'idle' | 'driving';

interface Device {
  id: string;
  lat: number;
  lon: number;
  heading: number;
  speed: number;
  soc: number;
  hours: number;
  mode: Mode;
  errors: string[];
}

const rand = seededRandom(7);
const devices: Device[] = Array.from({ length: count }, (_, i) => {
  const r = seededRandom(1000 + i);
  return {
    id: demoDeviceId(i),
    lat: BOUNDS.latMin + r() * (BOUNDS.latMax - BOUNDS.latMin),
    lon: BOUNDS.lonMin + r() * (BOUNDS.lonMax - BOUNDS.lonMin),
    heading: r() * 360,
    speed: 0,
    soc: 40 + r() * 60,
    hours: demoInitialEngineHours(i),
    mode: r() < 0.5 ? 'working' : 'idle',
    errors: [],
  };
});

function step(d: Device, dtSec: number): void {
  // Mode changes
  const roll = rand();
  if (d.mode === 'driving' && roll < 0.05) d.mode = 'working';
  else if (d.mode !== 'driving' && roll < 0.004) d.mode = 'driving';
  else if (d.mode === 'working' && roll < 0.03) d.mode = 'idle';
  else if (d.mode === 'idle' && roll < 0.03) d.mode = 'working';
  if (d.soc < 10) d.mode = 'idle';

  // Movement
  d.speed = d.mode === 'driving' ? 35 + rand() * 35 : d.mode === 'working' ? rand() * 4 : 0;
  d.heading = (d.heading + (rand() - 0.5) * (d.mode === 'driving' ? 30 : 90) + 360) % 360;
  const km = (d.speed * dtSec) / 3600;
  const rad = (d.heading * Math.PI) / 180;
  d.lat += (km / 111) * Math.cos(rad);
  d.lon += (km / (111 * Math.cos((d.lat * Math.PI) / 180))) * Math.sin(rad);
  // Turn back into the area instead of drifting away
  if (d.lat < BOUNDS.latMin || d.lat > BOUNDS.latMax || d.lon < BOUNDS.lonMin || d.lon > BOUNDS.lonMax) {
    d.heading = (d.heading + 180) % 360;
    d.lat = Math.min(Math.max(d.lat, BOUNDS.latMin), BOUNDS.latMax);
    d.lon = Math.min(Math.max(d.lon, BOUNDS.lonMin), BOUNDS.lonMax);
  }

  // Battery and hour meter
  const ignition = d.mode !== 'idle';
  if (ignition) {
    d.hours += dtSec / 3600;
    d.soc = Math.max(0, d.soc - (d.mode === 'working' ? 0.15 : 0.05) * (dtSec / 5));
  } else if (d.soc < 95) {
    d.soc = Math.min(100, d.soc + 0.4 * (dtSec / 5)); // on charger
  }

  // Errors
  if (ignition && rand() < 0.002) {
    const code = ERROR_CODES[Math.floor(rand() * ERROR_CODES.length)]!;
    if (!d.errors.includes(code)) d.errors.push(code);
  }
  if (d.errors.length > 0 && rand() < 0.02) d.errors.shift();
}

const client = await mqtt.connectAsync(url, { clientId: `rental-simulator-${process.pid}` });
console.log(`Simulating ${count} devices every ${intervalMs} ms → ${url}`);

const timer = setInterval(() => {
  const ts = new Date().toISOString();
  for (const d of devices) {
    step(d, intervalMs / 1000);
    const payload = {
      ts,
      lat: Number(d.lat.toFixed(6)),
      lon: Number(d.lon.toFixed(6)),
      spd: Number(d.speed.toFixed(1)),
      hdg: Math.round(d.heading),
      soc: Number(d.soc.toFixed(1)),
      hrs: Number(d.hours.toFixed(3)),
      ign: d.mode !== 'idle',
      err: d.errors,
    };
    client.publish(`devices/${d.id}/telemetry`, JSON.stringify(payload), { qos: 1 });
  }
}, intervalMs);

process.on('SIGINT', async () => {
  clearInterval(timer);
  await client.endAsync();
  process.exit(0);
});
