import {
  operationsDashboardSchema,
  operationsSearchResultSchema,
  notificationPreferencesSchema,
  type NotificationPreferences,
} from '@rental/validation';
export function operationsEndpointAllowed(method: string, path: string) {
  return new RegExp(
    '^organizations/[0-9a-f-]{36}/operations' +
      (method === 'GET'
        ? '(?:/search)?'
        : method === 'PATCH'
          ? '/(?:preferences|notifications/[a-f0-9]{64})'
          : '(?!)') +
      '$',
  ).test(path);
}
export class OperationsError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function createOperationsClient(
  baseUrl: string,
  transport: typeof fetch = fetch,
) {
  async function call<T>(
    org: string,
    path: string,
    schema: { parse(v: unknown): T },
    method = 'GET',
    body?: unknown,
  ) {
    const response = await transport(
      `${baseUrl}/organizations/${encodeURIComponent(org)}/operations${path}`,
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
    const value: unknown = await response.json();
    if (!response.ok)
      throw new OperationsError(
        value &&
          typeof value === 'object' &&
          'code' in value &&
          typeof value.code === 'string'
          ? value.code
          : 'INTERNAL_ERROR',
      );
    return schema.parse(value);
  }
  return {
    dashboard: (org: string, branchId = '') =>
      call(
        org,
        branchId ? '?branchId=' + encodeURIComponent(branchId) : '',
        operationsDashboardSchema,
      ),
    search: (org: string, q: string) =>
      call(
        org,
        '/search?q=' + encodeURIComponent(q),
        operationsSearchResultSchema,
      ),
    preferences: (org: string, body: NotificationPreferences) =>
      call(org, '/preferences', notificationPreferencesSchema, 'PATCH', body),
    interact: (
      org: string,
      key: string,
      action: 'READ' | 'UNREAD' | 'ACKNOWLEDGE' | 'DISMISS',
    ) =>
      call(org, '/notifications/' + key, { parse: () => true }, 'PATCH', {
        action,
      }),
  };
}
