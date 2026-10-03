import { describe, expect, it } from 'vitest';
import { parseSimulatorMessage } from './simulator.js';

describe('parseSimulatorMessage', () => {
  it('maps the simulator payload to a TelemetryPoint', () => {
    const payload = {
      ts: '2026-10-03T12:00:00.000Z',
      lat: 41.0, lon: 29.0, spd: 12.5, hdg: 90, soc: 77, hrs: 1234.5, ign: true, err: ['E101'],
    };
    const [point] = parseSimulatorMessage('devices/SIM-0001/telemetry', Buffer.from(JSON.stringify(payload)));
    expect(point).toMatchObject({
      provider: 'simulator',
      deviceExternalId: 'SIM-0001',
      lat: 41.0,
      lon: 29.0,
      batterySoc: 77,
      engineHours: 1234.5,
      ignition: true,
      errorCodes: ['E101'],
    });
    expect(point!.recordedAt).toEqual(new Date(payload.ts));
  });

  it('rejects out-of-range values', () => {
    const bad = { ts: '2026-10-03T12:00:00Z', lat: 200, lon: 0, spd: 0, hdg: 0, soc: 50, hrs: 0, ign: false, err: [] };
    expect(() => parseSimulatorMessage('devices/X/telemetry', Buffer.from(JSON.stringify(bad)))).toThrow();
  });
});
