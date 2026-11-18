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
  if (!response.ok) throw Error('Request failed');
  return response.json();
}
