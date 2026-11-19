import { NextResponse } from 'next/server';
import { getAuth0 } from '../../../../lib/auth0';
import {
  operationsEndpointAllowed,
  administrationEndpointAllowed,
  analyticsEndpointAllowed,
  maintenanceEndpointAllowed,
  telemetryEndpointAllowed,
  rentalEndpointAllowed,
  customerEndpointAllowed,
  machineEndpointAllowed,
} from '@rental/api-client';

// Fixed route allowlist and origin: never an arbitrary credential-bearing proxy.
async function forward(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const endpoint = path.join('/');
  const allowed =
    operationsEndpointAllowed(request.method, endpoint) ||
    administrationEndpointAllowed(request.method, endpoint) ||
    analyticsEndpointAllowed(request.method, endpoint) ||
    telemetryEndpointAllowed(request.method, endpoint) ||
    maintenanceEndpointAllowed(request.method, endpoint) ||
    rentalEndpointAllowed(request.method, endpoint) ||
    customerEndpointAllowed(request.method, endpoint) ||
    machineEndpointAllowed(request.method, endpoint) ||
    (request.method === 'GET' && endpoint === 'me') ||
    (request.method === 'POST' &&
      (endpoint === 'invitations/accept' ||
        endpoint === 'platform/organizations' ||
        /^platform\/organizations\/[0-9a-f-]{36}\/invitations\/[0-9a-f-]{36}\/revoke$/.test(
          endpoint,
        ) ||
        /^organizations\/[0-9a-f-]{36}\/invitations(?:\/[0-9a-f-]{36}\/revoke)?$/.test(
          endpoint,
        )));
  if (!allowed)
    return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  if (
    request.method !== 'GET' &&
    request.headers.get('origin') !==
      new URL(process.env.APP_BASE_URL ?? '').origin
  )
    return NextResponse.json({ code: 'ACCESS_DENIED' }, { status: 403 });
  try {
    const auth0 = getAuth0();
    if (!(await auth0.getSession()))
      return NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
    const { token } = await auth0.getAccessToken();
    const body = request.method !== 'GET' ? await request.text() : undefined;
    if (body && body.length > 16384)
      return NextResponse.json({ code: 'INVALID_INPUT' }, { status: 400 });
    const response = await fetch(
      new URL(
        endpoint + new URL(request.url).search,
        `${process.env.API_BASE_URL?.replace(/\/$/, '')}/`,
      ),
      {
        method: request.method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        ...(body === undefined ? {} : { body }),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      },
    );
    const isReport =
      request.method === 'GET' &&
      /^organizations\/[0-9a-f-]{36}\/(?:finance\/export|maintenance\/machines\/[0-9a-f-]{36}\/export\/(pdf|xlsx))$/.test(
        endpoint,
      ) &&
      response.ok;
    return new NextResponse(
      isReport ? await response.arrayBuffer() : await response.text(),
      {
        status: response.status,
        headers: {
          'content-type': isReport
            ? endpoint.endsWith('/pdf')
              ? 'application/pdf'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/json',
          ...(isReport
            ? {
                'content-disposition':
                  'attachment; filename="' +
                  (endpoint.includes('/finance/')
                    ? 'finance-estimates.'
                    : 'maintenance.') +
                  (endpoint.endsWith('/pdf') ? 'pdf' : 'xlsx') +
                  '"',
              }
            : {}),
          'cache-control': 'no-store',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { code: 'AUTHENTICATION_OR_API_UNAVAILABLE' },
      { status: 503 },
    );
  }
}
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
