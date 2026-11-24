export type DeploymentEnvironment =
  'development' | 'test' | 'staging' | 'production';

export function deploymentEnvironment(
  env: NodeJS.ProcessEnv,
): DeploymentEnvironment {
  const mode =
    env['DEPLOYMENT_ENV'] ??
    (env['NODE_ENV'] === 'production' ? 'production' : 'development');
  if (!['development', 'test', 'staging', 'production'].includes(mode))
    throw new Error('Invalid DEPLOYMENT_ENV');
  return mode as DeploymentEnvironment;
}

export function hardenedDeployment(env: NodeJS.ProcessEnv): boolean {
  return ['staging', 'production'].includes(deploymentEnvironment(env));
}

function invalid(key: string): never {
  throw new Error(`Invalid deployment configuration: ${key}`);
}

export function validateDeployment(
  env: NodeJS.ProcessEnv,
  service: 'web' | 'api' | 'worker' | 'telemetry',
): void {
  if (!hardenedDeployment(env)) return;
  if (env['NODE_ENV'] !== 'production') invalid('NODE_ENV');
  if (Object.keys(env).some((key) => key.startsWith('RENTAL_E2E') && env[key]))
    invalid('test configuration');
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(env['DEPLOYMENT_ID'] ?? ''))
    invalid('DEPLOYMENT_ID');
  if (service === 'api') {
    let url: URL;
    try {
      url = new URL(env['DATABASE_URL'] ?? '');
    } catch {
      invalid('DATABASE_URL');
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.password ||
      !env['DATABASE_NAME'] ||
      decodeURIComponent(url.pathname.slice(1)) !== env['DATABASE_NAME']
    )
      invalid('DATABASE_URL / DATABASE_NAME');
    // Plaintext is limited to the private Compose database network. External DBs require certificate verification.
    if (
      url.hostname !== 'postgres' &&
      url.searchParams.get('sslmode') !== 'verify-full'
    )
      invalid('DATABASE_URL TLS');
  }
}

export function validateWebEnvironment(env: NodeJS.ProcessEnv): void {
  for (const key of [
    'AUTH0_DOMAIN',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
    'AUTH0_SECRET',
    'AUTH0_AUDIENCE',
    'APP_BASE_URL',
    'API_BASE_URL',
  ])
    if (!env[key]) invalid(key);
  if (!/^[a-fA-F0-9]{64}$/.test(env['AUTH0_SECRET'] ?? ''))
    invalid('AUTH0_SECRET');
  if (!/^[a-zA-Z0-9.-]+$/.test(env['AUTH0_DOMAIN'] ?? ''))
    invalid('AUTH0_DOMAIN');
  validateDeployment(env, 'web');
  const hardened = hardenedDeployment(env);
  if (hardened && new Set(env['AUTH0_SECRET']).size < 8)
    invalid('AUTH0_SECRET entropy');
  for (const key of ['APP_BASE_URL', 'API_BASE_URL']) {
    let url: URL;
    try {
      url = new URL(env[key]!);
    } catch {
      invalid(key);
    }
    const internalApi =
      key === 'API_BASE_URL' && url.hostname === 'api' && url.port === '3001';
    const local =
      !hardened && ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && (internalApi || local))
      )
    )
      invalid(key);
  }
  // The application owns cookie scope; do not inherit broader SDK environment overrides.
  if (
    env['AUTH0_COOKIE_DOMAIN'] ||
    (env['AUTH0_COOKIE_PATH'] && env['AUTH0_COOKIE_PATH'] !== '/')
  )
    invalid('cookie scope');
}
