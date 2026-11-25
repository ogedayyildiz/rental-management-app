import {
  rentalPageSchema,
  rentalViewSchema,
  rentalCatalogSchema,
  rentalAvailabilityPageSchema,
} from '@rental/validation';
export type RentalAction =
  | 'quote'
  | 'reserve'
  | 'dispatch'
  | 'return'
  | 'complete'
  | 'cancel'
  | 'extend'
  | 'assign'
  | 'release'
  | 'replace';
export class RentalApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`RENTAL_API_${status}`);
  }
}
export function rentalEndpointAllowed(method: string, path: string): boolean {
  const root = 'organizations/[0-9a-f-]{36}/rentals';
  if (method === 'GET')
    return new RegExp(
      `^${root}(?:/(?:catalog|availability|[0-9a-f-]{36}))?$`,
    ).test(path);
  if (method === 'POST')
    return new RegExp(
      `^${root}(?:/[0-9a-f-]{36}/(?:quote|reserve|dispatch|return|complete|cancel|extend|assign|release|replace))?$`,
    ).test(path);
  return method === 'PATCH' && new RegExp(`^${root}/[0-9a-f-]{36}$`).test(path);
}
export function createRentalClient(
  baseUrl: string,
  transport: typeof fetch = fetch,
) {
  async function request<T>(
    path: string,
    method: string,
    body: unknown,
    parse: (v: unknown) => T,
  ): Promise<T> {
    const response = await transport(`${baseUrl.replace(/\/$/, '')}/${path}`, {
      method,
      cache: 'no-store',
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    if (!response.ok) {
      const error: unknown = await response.json().catch(() => null);
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'REQUEST_FAILED';
      throw new RentalApiError(response.status, code);
    }
    return parse(await response.json());
  }
  const root = (org: string) =>
      `organizations/${encodeURIComponent(org)}/rentals`,
    item = (org: string, id: string) =>
      `${root(org)}/${encodeURIComponent(id)}`;
  return {
    list: (org: string, q: URLSearchParams) =>
      request(`${root(org)}?${q}`, 'GET', undefined, rentalPageSchema.parse),
    get: (org: string, id: string) =>
      request(item(org, id), 'GET', undefined, rentalViewSchema.parse),
    catalog: (org: string) =>
      request(
        `${root(org)}/catalog`,
        'GET',
        undefined,
        rentalCatalogSchema.parse,
      ),
    availability: (org: string, q: URLSearchParams) =>
      request(
        `${root(org)}/availability?${q}`,
        'GET',
        undefined,
        rentalAvailabilityPageSchema.parse,
      ),
    create: (org: string, body: unknown) =>
      request(root(org), 'POST', body, rentalViewSchema.parse),
    update: (org: string, id: string, body: unknown) =>
      request(item(org, id), 'PATCH', body, rentalViewSchema.parse),
    action: (
      org: string,
      id: string,
      action: RentalAction,
      body: unknown = {},
    ) =>
      request(
        `${item(org, id)}/${action}`,
        'POST',
        body,
        rentalViewSchema.parse,
      ),
  };
}
