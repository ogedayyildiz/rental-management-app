import 'server-only';
import { Auth0Client } from '@auth0/nextjs-auth0/server';
import { NextResponse } from 'next/server';

let client: Auth0Client | undefined;
export function getAuth0(): Auth0Client {
  if (!client) {
    for (const key of [
      'AUTH0_DOMAIN',
      'AUTH0_CLIENT_ID',
      'AUTH0_CLIENT_SECRET',
      'AUTH0_SECRET',
      'AUTH0_AUDIENCE',
      'APP_BASE_URL',
      'API_BASE_URL',
    ]) {
      if (!process.env[key])
        throw new Error(`Missing server configuration: ${key}`);
    }
    if (!/^[a-fA-F0-9]{64}$/.test(process.env.AUTH0_SECRET ?? ''))
      throw new Error('Invalid AUTH0_SECRET');
    client = new Auth0Client({
      authorizationParameters: {
        audience: process.env.AUTH0_AUDIENCE!,
        scope: 'openid profile email offline_access',
      },
      enableAccessTokenEndpoint: false,
      session: { absoluteDuration: 8 * 60 * 60, inactivityDuration: 60 * 60 },
      onCallback: async (error) =>
        NextResponse.redirect(
          new URL(error ? '/?authError=1' : '/', process.env.APP_BASE_URL),
        ),
    });
  }
  return client;
}
