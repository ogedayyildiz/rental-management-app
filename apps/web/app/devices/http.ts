export async function deviceHttp<T>(
  org: string,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    '/api/backend/organizations/' + encodeURIComponent(org) + '/' + path,
    {
      method,
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = new Error('DEVICE_REQUEST_FAILED');
    throw Object.assign(error, {
      status: response.status,
      code:
        body && typeof body === 'object' && 'code' in body
          ? body.code
          : undefined,
    });
  }
  return response.json();
}
