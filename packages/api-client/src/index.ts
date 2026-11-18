export * from './customers.js';
export * from './machines.js';

export * from './rentals.js';

export * from './maintenance.js';
export function telemetryEndpointAllowed(method: string, path: string) {
  const id = '[0-9a-f-]{36}',
    base = '^organizations/' + id + '/';
  const routes: Record<string, string> = {
    GET:
      '(?:devices(?:/' + id + ')?|machines/' + id + '/telemetry(?:/history)?)',
    POST: 'devices(?:/' + id + '/(?:install|move|remove))?',
    PATCH: 'devices/' + id,
  };
  return !!routes[method] && new RegExp(base + routes[method] + '$').test(path);
}
export * from './analytics.js';
