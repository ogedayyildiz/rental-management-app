import {
  machinePageSchema,
  machineViewSchema,
  machineBranchListSchema,
} from '@rental/validation';
export class MachineApiError extends Error {
  constructor(readonly status: number) {
    super(`MACHINE_API_${status}`);
  }
}
export function machineEndpointAllowed(method: string, path: string): boolean {
  const root = 'organizations/[0-9a-f-]{36}/machines';
  if (method === 'GET')
    return new RegExp(`^${root}(?:/(?:branches|[0-9a-f-]{36}))?$`).test(path);
  if (method === 'POST')
    return new RegExp(`^${root}(?:/[0-9a-f-]{36}/archive)?$`).test(path);
  if (method === 'PATCH')
    return new RegExp(`^${root}/[0-9a-f-]{36}$`).test(path);
  return false;
}
export function createMachineClient(
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
    if (!response.ok) throw new MachineApiError(response.status);
    return parse(await response.json());
  }
  const root = (org: string) =>
      `organizations/${encodeURIComponent(org)}/machines`,
    item = (org: string, id: string) =>
      `${root(org)}/${encodeURIComponent(id)}`;
  return {
    list: (org: string, q: URLSearchParams) =>
      request(`${root(org)}?${q}`, 'GET', undefined, machinePageSchema.parse),
    get: (org: string, id: string) =>
      request(item(org, id), 'GET', undefined, machineViewSchema.parse),
    branches: (org: string) =>
      request(
        `${root(org)}/branches`,
        'GET',
        undefined,
        machineBranchListSchema.parse,
      ),
    create: (org: string, body: unknown) =>
      request(root(org), 'POST', body, machineViewSchema.parse),
    update: (org: string, id: string, body: unknown) =>
      request(item(org, id), 'PATCH', body, machineViewSchema.parse),
    archive: (org: string, id: string, lifecycleState: 'RETIRED' | 'SOLD') =>
      request(
        `${item(org, id)}/archive`,
        'POST',
        { lifecycleState },
        machineViewSchema.parse,
      ),
  };
}
