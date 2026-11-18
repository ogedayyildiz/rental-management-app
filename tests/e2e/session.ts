// Copied over lib/auth0.ts ONLY in the disposable E2E workspace.
import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// @ts-expect-error test-only JavaScript copied alongside this adapter
import { assertE2E, identityFor } from './e2e-isolation.mjs';
export function getAuth0() {
  assertE2E(process.env);
  async function token() {
    const value = (await cookies()).get('rental_e2e_session')?.value;
    return identityFor(process.env, value) ? value : null;
  }
  return {
    async getSession() {
      return (await token()) ? { user: { sub: 'test-session' } } : null;
    },
    async getAccessToken() {
      const value = await token();
      if (!value) throw Error('Unauthenticated');
      return { token: value };
    },
    async middleware(request: NextRequest) {
      if (request.nextUrl.pathname.startsWith('/auth/'))
        return new NextResponse(null, { status: 404 });
      return NextResponse.next();
    },
  };
}
