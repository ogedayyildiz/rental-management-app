import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

export const bootstrapCallback = 'http://127.0.0.1:43187/callback';

export interface BootstrapLoginConfiguration {
  issuer: string;
  audience: string;
  clientId: string;
  clientSecret: string;
}

// Tokens and authorization codes stay in this process; only the authorization
// URL (public client ID, state and PKCE challenge) is displayed to the operator.
export async function bootstrapLogin(
  configuration: BootstrapLoginConfiguration,
  openAuthorization: (url: string) => void,
): Promise<string> {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const authorization = new URL('authorize', configuration.issuer);
  authorization.search = new URLSearchParams({
    response_type: 'code',
    client_id: configuration.clientId,
    redirect_uri: bootstrapCallback,
    audience: configuration.audience,
    scope: 'openid profile email',
    prompt: 'login',
    max_age: '0',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      if (
        !request.url ||
        !request.url.startsWith('/callback?') ||
        request.url.length > 8192 ||
        request.method !== 'GET' ||
        request.headers.host !== '127.0.0.1:43187'
      ) {
        response.writeHead(400).end('Invalid callback');
        return;
      }
      const url = new URL(request.url, bootstrapCallback);
      const receivedState = Buffer.from(url.searchParams.get('state') ?? '');
      const expectedState = Buffer.from(state);
      if (
        url.pathname !== '/callback' ||
        receivedState.length !== expectedState.length ||
        !timingSafeEqual(receivedState, expectedState) ||
        url.searchParams.getAll('state').length !== 1
      ) {
        response.writeHead(400).end('Invalid callback');
        return;
      }
      const receivedCode = url.searchParams.get('code');
      response.end(
        'Return to the terminal to check the bootstrap result. You may close this tab.',
      );
      cleanup();
      if (
        !receivedCode ||
        url.searchParams.has('error') ||
        url.searchParams.getAll('code').length !== 1
      )
        reject(new Error('Authentication failed'));
      else resolve(receivedCode);
    });
    function cleanup() {
      clearTimeout(timeout);
      server.close();
      server.closeAllConnections();
    }
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Authentication timed out'));
    }, 300_000);
    server.requestTimeout = 10_000;
    server.headersTimeout = 10_000;
    server.on('error', () => {
      cleanup();
      reject(new Error('Cannot open bootstrap callback'));
    });
    server.listen(43187, '127.0.0.1', () => {
      try {
        openAuthorization(authorization.href);
      } catch {
        cleanup();
        reject(new Error('Cannot start authentication'));
      }
    });
  });
  const response = await fetch(new URL('oauth/token', configuration.issuer), {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      code,
      redirect_uri: bootstrapCallback,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error('Token exchange failed');
  const result: unknown = await response.json();
  if (
    typeof result !== 'object' ||
    result === null ||
    !('access_token' in result) ||
    typeof result.access_token !== 'string' ||
    !result.access_token ||
    result.access_token.length > 16384
  )
    throw new Error('Token exchange failed');
  return result.access_token;
}
