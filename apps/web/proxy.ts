import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuth0 } from './lib/auth0';
import { securityHeaders } from './lib/web-security';
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const headers = securityHeaders(
    nonce,
    process.env.NODE_ENV === 'production',
    process.env.APP_BASE_URL?.startsWith('https://') === true,
  );
  const forwarded = new Headers(request.headers);
  forwarded.set('Content-Security-Policy', headers['Content-Security-Policy']!);
  forwarded.set('x-nonce', nonce);
  const auth = await getAuth0().middleware(request);
  let response = auth;
  if (auth.headers.get('x-middleware-next') === '1') {
    response = NextResponse.next({ request: { headers: forwarded } });
    auth.headers.forEach((value, key) => {
      if (key !== 'set-cookie' && !key.startsWith('x-middleware-'))
        response.headers.set(key, value);
    });
    for (const cookie of auth.cookies.getAll()) response.cookies.set(cookie);
  }
  for (const [key, value] of Object.entries(headers))
    response.headers.set(key, value);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|health$|ready$).*)',
  ],
};
