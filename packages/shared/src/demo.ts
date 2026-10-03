/**
 * Fixtures shared by the database seed and the telemetry simulator, so the
 * simulated devices line up with seeded machines. Development only.
 */
export const DEMO_ORG_ID = '00000000-0000-4000-8000-000000000001';
export const SIMULATOR_PROVIDER = 'simulator';

export const demoDeviceId = (index: number) => `SIM-${String(index + 1).padStart(4, '0')}`;

/** Hour meter reading the simulator starts each device from. */
export const demoInitialEngineHours = (index: number) => 150 + ((index * 137) % 1900);

/** Deterministic PRNG (mulberry32) so reruns produce the same demo data. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
