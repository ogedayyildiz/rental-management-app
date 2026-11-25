import 'server-only';
import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';
import { validateWebEnvironment } from '@rental/config';

let client: Auth0Client | undefined;
export function getAuth0(): Auth0Client {
  if (!client) {
    validateWebEnvironment(process.env);
    client = new Auth0Client({
      authorizationParameters: {
        audience: process.env.AUTH0_AUDIENCE!,
        scope: 'openid profile email offline_access',
      },
      enableAccessTokenEndpoint: false,
      session: {
        absoluteDuration: 8 * 60 * 60,
        inactivityDuration: 60 * 60,
        cookie: {
          secure: process.env.APP_BASE_URL!.startsWith('https://'),
          sameSite: 'lax',
          path: '/',
        },
      },
      onCallback: async (error) =>
        NextResponse.redirect(
          new URL(
            error ? '/?authError=1' : '/dashboard',
            process.env.APP_BASE_URL,
          ),
        ),
    });
  }
  return client;
}
