// Synthetic discovery service only. Never issues tokens or authenticates a user.
import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
const origin = 'https://oidc.test';
const server = createServer(
  {
    key: readFileSync('/certs/privkey.pem'),
    cert: readFileSync('/certs/fullchain.pem'),
  },
  (request, response) => {
    if (request.url !== '/.well-known/openid-configuration') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        issuer: origin + '/',
        authorization_endpoint: origin + '/authorize',
        token_endpoint: origin + '/oauth/token',
        jwks_uri: origin + '/.well-known/jwks.json',
        end_session_endpoint: origin + '/oidc/logout',
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      }),
    );
  },
);
server.listen(443, '0.0.0.0');
process.on('SIGTERM', () => server.close());
