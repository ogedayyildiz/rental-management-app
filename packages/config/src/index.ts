import { z } from 'zod';

export function readAuth0Environment(environment: NodeJS.ProcessEnv) {
  const result = z
    .object({
      issuer: z.url().refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === 'https:' &&
          url.pathname === '/' &&
          !url.search &&
          !url.hash &&
          !url.username &&
          !url.password
        );
      }),
      audience: z.string().trim().min(1),
      clientIds: z
        .string()
        .min(1)
        .transform((value) => value.split(',').map((id) => id.trim()))
        .pipe(z.array(z.string().min(1)).min(1)),
    })
    .safeParse({
      issuer: environment['AUTH0_ISSUER'],
      audience: environment['AUTH0_AUDIENCE'],
      clientIds: environment['AUTH0_ALLOWED_CLIENT_IDS'],
    });
  if (!result.success)
    throw new Error(
      'Invalid Auth0 configuration: AUTH0_ISSUER, AUTH0_AUDIENCE, AUTH0_ALLOWED_CLIENT_IDS',
    );
  return result.data;
}

export function readServiceEnvironment(
  environment: NodeJS.ProcessEnv,
  portKey: string,
  defaultPort: number,
): { host: string; port: number } {
  const result = z
    .object({
      host: z.string().trim().min(1).default('127.0.0.1'),
      port: z.coerce.number().int().min(1).max(65535).default(defaultPort),
    })
    .safeParse({ host: environment['HOST'], port: environment[portKey] });

  if (!result.success) {
    // Do not include environment values: future configuration may contain secrets.
    throw new Error(`Invalid service configuration: HOST or ${portKey}`);
  }
  return result.data;
}
