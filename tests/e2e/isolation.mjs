// Imported only by the test launcher and temporary web copy, never by production.
export const issuer = 'https://e2e.rental.invalid';
export function assertE2E(env) {
  if (
    env.NODE_ENV === 'production' ||
    !/^[a-f0-9]{32}$/.test(env.RENTAL_E2E_RUN ?? '')
  )
    throw new Error('Isolated E2E process required');
  const db = new URL(env.DATABASE_URL);
  if (
    db.hostname !== '127.0.0.1' ||
    db.pathname !== `/rental_e2e_${env.RENTAL_E2E_RUN}` ||
    env.APP_BASE_URL !== 'http://127.0.0.1:3100' ||
    env.API_BASE_URL !== 'http://127.0.0.1:3101'
  )
    throw new Error('Unsafe E2E configuration');
  const identities = JSON.parse(env.RENTAL_E2E_IDENTITIES ?? '{}');
  if (
    Object.keys(identities).length !== 7 ||
    Object.values(identities).some((x) => !/^[a-f0-9]{64}$/.test(x.token))
  )
    throw new Error('Ephemeral E2E identities required');
  return identities;
}
export function identityFor(env, token) {
  const identities = assertE2E(env);
  const found = Object.entries(identities).find(
    ([, value]) => value.token === token,
  );
  return found ? { issuer, subject: found[0] } : null;
}
