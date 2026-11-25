import {
  addressListSchema,
  addressViewSchema,
  contactListSchema,
  contactViewSchema,
  customerPageSchema,
  customerSearchSchema,
  customerViewSchema,
} from '@rental/validation';
import type {
  AddressInput,
  ContactInput,
  CustomerInput,
} from '@rental/validation';

export class CustomerApiError extends Error {
  constructor(readonly status: number) {
    super(`CUSTOMER_API_${status}`);
  }
}
export function customerEndpointAllowed(method: string, path: string): boolean {
  const root = 'organizations/[0-9a-f-]{36}/customers';
  if (method === 'GET')
    return new RegExp(
      `^${root}(?:/[0-9a-f-]{36}(?:/(?:contacts|addresses))?)?$`,
    ).test(path);
  if (method === 'POST')
    return new RegExp(
      `^${root}(?:/[0-9a-f-]{36}/(?:archive|contacts|addresses))?$`,
    ).test(path);
  if (method === 'PATCH')
    return new RegExp(
      `^${root}/[0-9a-f-]{36}(?:/(?:contacts|addresses)/[0-9a-f-]{36})?$`,
    ).test(path);
  return false;
}
// Web uses the same-origin bridge; native clients may supply a token-attaching fetch adapter.
export function createCustomerClient(
  baseUrl: string,
  transport: typeof fetch = fetch,
) {
  async function request<T>(
    path: string,
    method: string,
    body: unknown,
    parse: (value: unknown) => T,
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
    if (!response.ok) throw new CustomerApiError(response.status);
    const payload: unknown = await response.json();
    return parse(payload);
  }
  const root = (org: string) =>
    `organizations/${encodeURIComponent(org)}/customers`;
  const item = (org: string, id: string) =>
    `${root(org)}/${encodeURIComponent(id)}`;
  return {
    // Rental selectors consume the Customer search contract, not persistence's boolean active field.
    listActive: (org: string, q = '', cursor?: string) => {
      const query = customerSearchSchema.parse({
        q,
        status: 'ACTIVE',
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
      return request(
        `${root(org)}?${new URLSearchParams({
          q: query.q,
          status: query.status,
          limit: String(query.limit),
          ...(query.cursor ? { cursor: query.cursor } : {}),
        })}`,
        'GET',
        undefined,
        customerPageSchema.parse,
      );
    },
    list: (org: string, query: URLSearchParams) =>
      request(
        `${root(org)}?${query}`,
        'GET',
        undefined,
        customerPageSchema.parse,
      ),
    get: (org: string, id: string) =>
      request(item(org, id), 'GET', undefined, customerViewSchema.parse),
    create: (org: string, input: CustomerInput) =>
      request(root(org), 'POST', input, customerViewSchema.parse),
    update: (org: string, id: string, input: CustomerInput) =>
      request(item(org, id), 'PATCH', input, customerViewSchema.parse),
    archive: (org: string, id: string) =>
      request(`${item(org, id)}/archive`, 'POST', {}, customerViewSchema.parse),
    contacts: (org: string, id: string) =>
      request(
        `${item(org, id)}/contacts`,
        'GET',
        undefined,
        contactListSchema.parse,
      ),
    addresses: (org: string, id: string) =>
      request(
        `${item(org, id)}/addresses`,
        'GET',
        undefined,
        addressListSchema.parse,
      ),
    saveContact: (
      org: string,
      id: string,
      child: string | null,
      input: ContactInput,
    ) =>
      request(
        `${item(org, id)}/contacts${child ? `/${encodeURIComponent(child)}` : ''}`,
        child ? 'PATCH' : 'POST',
        input,
        contactViewSchema.parse,
      ),
    saveAddress: (
      org: string,
      id: string,
      child: string | null,
      input: AddressInput,
    ) =>
      request(
        `${item(org, id)}/addresses${child ? `/${encodeURIComponent(child)}` : ''}`,
        child ? 'PATCH' : 'POST',
        input,
        addressViewSchema.parse,
      ),
  };
}
