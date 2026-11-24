import {
  financeRecordViewSchema,
  financeRecordsPageSchema,
  financeBalancesSchema,
  machineBranchListSchema,
} from '@rental/validation';
export function financeOperationsEndpointAllowed(
  method: string,
  path: string,
): boolean {
  const base = 'organizations/[0-9a-f-]{36}/finance/records';
  return (
    (method === 'GET' &&
      new RegExp(`^${base}(?:/balances|/branches|/[0-9a-f-]{36})?$`).test(
        path,
      )) ||
    (method === 'POST' &&
      new RegExp(
        `^${base}(?:/[0-9a-f-]{36}/(?:confirm|cancel|payments|payments/[0-9a-f-]{36}/reverse))?$`,
      ).test(path)) ||
    (method === 'PATCH' &&
      new RegExp(`^${base}/[0-9a-f-]{36}(?:/document)?$`).test(path))
  );
}
export class FinanceOperationsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
export function createFinanceOperationsClient(
  baseUrl: string,
  transport: typeof fetch = fetch,
) {
  async function request(
    org: string,
    suffix: string,
    method = 'GET',
    body?: unknown,
  ) {
    const r = await transport(
      `${baseUrl.replace(/\/$/, '')}/organizations/${encodeURIComponent(org)}/finance/records${suffix}`,
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
      const e: unknown = await r.json();
      throw new FinanceOperationsError(
        typeof e === 'object' &&
          e !== null &&
          'code' in e &&
          typeof e.code === 'string'
          ? e.code
          : 'REQUEST_FAILED',
        r.status,
      );
    }
    return r.json() as Promise<unknown>;
  }
  return {
    branches: async (org: string, kind: string) =>
      machineBranchListSchema.parse(
        await request(org, '/branches?kind=' + encodeURIComponent(kind)),
      ),
    list: async (org: string, q: URLSearchParams) =>
      financeRecordsPageSchema.parse(await request(org, '?' + q)),
    balances: async (org: string, q: URLSearchParams) =>
      financeBalancesSchema.parse(await request(org, '/balances?' + q)),
    get: async (org: string, id: string) =>
      financeRecordViewSchema.parse(
        await request(org, '/' + encodeURIComponent(id)),
      ),
    create: async (org: string, body: unknown) =>
      financeRecordViewSchema.parse(await request(org, '', 'POST', body)),
    update: async (org: string, id: string, body: unknown) =>
      financeRecordViewSchema.parse(
        await request(org, '/' + encodeURIComponent(id), 'PATCH', body),
      ),
    action: async (
      org: string,
      id: string,
      action: 'confirm' | 'cancel' | 'payments' | 'document',
      body: unknown,
    ) =>
      financeRecordViewSchema.parse(
        await request(
          org,
          `/${encodeURIComponent(id)}/${action}`,
          action === 'document' ? 'PATCH' : 'POST',
          body,
        ),
      ),
    reverse: async (
      org: string,
      id: string,
      paymentId: string,
      body: unknown,
    ) =>
      financeRecordViewSchema.parse(
        await request(
          org,
          `/${encodeURIComponent(id)}/payments/${encodeURIComponent(paymentId)}/reverse`,
          'POST',
          body,
        ),
      ),
  };
}
