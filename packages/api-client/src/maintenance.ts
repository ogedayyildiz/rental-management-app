import {
  workOrderPageSchema,
  workOrderViewSchema,
  maintenanceIdSchema,
  maintenancePlansSchema,
  machineMaintenancePlansSchema,
  serviceRestrictionsSchema,
} from '@rental/validation';
export class MaintenanceApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super('MAINTENANCE_API_' + status);
  }
}
export function maintenanceEndpointAllowed(method: string, path: string) {
  const root = 'organizations/[0-9a-f-]{36}/maintenance',
    id = '[0-9a-f-]{36}';
  if (method === 'GET')
    return new RegExp(
      '^' +
        root +
        '(?:/(?:plans|' +
        id +
        '|machines/' +
        id +
        '/(?:plans|blocks|export/(?:pdf|xlsx))))?$',
    ).test(path);
  if (method === 'POST')
    return new RegExp(
      '^' +
        root +
        '(?:/(?:plans|machine-plans|' +
        id +
        '/(?:open|schedule|start|complete|cancel|materials|costs)|machines/' +
        id +
        '/blocks(?:/' +
        id +
        '/release)?))?$',
    ).test(path);
  return (
    method === 'PATCH' &&
    new RegExp(
      '^' +
        root +
        '/(?:' +
        id +
        '|plans/' +
        id +
        '|' +
        id +
        '/tasks/' +
        id +
        ')$',
    ).test(path)
  );
}
export function createMaintenanceClient(
  baseUrl: string,
  transport: typeof fetch = fetch,
) {
  async function request<T>(
    org: string,
    path: string,
    method: string,
    body: unknown,
    parse: (v: unknown) => T,
  ): Promise<T> {
    const r = await transport(
      baseUrl.replace(/\/$/, '') +
        '/organizations/' +
        encodeURIComponent(org) +
        '/maintenance' +
        path,
      {
        method,
        cache: 'no-store',
        ...(body === undefined
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
      },
    );
    if (!r.ok) {
      const e: unknown = await r.json().catch(() => null);
      throw new MaintenanceApiError(
        r.status,
        typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          typeof e.code === 'string'
          ? e.code
          : 'REQUEST_FAILED',
      );
    }
    return parse(await r.json());
  }
  const identifier = maintenanceIdSchema;
  return {
    list: (org: string, q = new URLSearchParams()) =>
      request(org, '?' + q, 'GET', undefined, workOrderPageSchema.parse),
    get: (org: string, id: string) =>
      request(
        org,
        '/' + encodeURIComponent(id),
        'GET',
        undefined,
        workOrderViewSchema.parse,
      ),
    create: (org: string, body: unknown) =>
      request(org, '', 'POST', body, workOrderViewSchema.parse),
    update: (org: string, id: string, body: unknown) =>
      request(
        org,
        '/' + encodeURIComponent(id),
        'PATCH',
        body,
        workOrderViewSchema.parse,
      ),
    action: (
      org: string,
      id: string,
      action:
        | 'open'
        | 'schedule'
        | 'start'
        | 'complete'
        | 'cancel'
        | 'materials'
        | 'costs',
      body: unknown,
    ) =>
      request(
        org,
        '/' + encodeURIComponent(id) + '/' + action,
        'POST',
        body,
        workOrderViewSchema.parse,
      ),
    task: (org: string, id: string, taskId: string, body: unknown) =>
      request(
        org,
        '/' + encodeURIComponent(id) + '/tasks/' + encodeURIComponent(taskId),
        'PATCH',
        body,
        workOrderViewSchema.parse,
      ),
    plans: (org: string) =>
      request(org, '/plans', 'GET', undefined, maintenancePlansSchema.parse),
    savePlan: (org: string, body: unknown, id?: string) =>
      request(
        org,
        '/plans' + (id ? '/' + encodeURIComponent(id) : ''),
        id ? 'PATCH' : 'POST',
        body,
        identifier.parse,
      ),
    schedules: (org: string, machineId: string) =>
      request(
        org,
        '/machines/' + encodeURIComponent(machineId) + '/plans',
        'GET',
        undefined,
        machineMaintenancePlansSchema.parse,
      ),
    saveSchedule: (org: string, body: unknown) =>
      request(org, '/machine-plans', 'POST', body, identifier.parse),
    blocks: (org: string, machineId: string) =>
      request(
        org,
        '/machines/' + encodeURIComponent(machineId) + '/blocks',
        'GET',
        undefined,
        serviceRestrictionsSchema.parse,
      ),
    block: (org: string, machineId: string, body: unknown) =>
      request(
        org,
        '/machines/' + encodeURIComponent(machineId) + '/blocks',
        'POST',
        body,
        identifier.parse,
      ),
    release: (org: string, machineId: string, id: string, body: unknown) =>
      request(
        org,
        '/machines/' +
          encodeURIComponent(machineId) +
          '/blocks/' +
          encodeURIComponent(id) +
          '/release',
        'POST',
        body,
        identifier.parse,
      ),
  };
}
