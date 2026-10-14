import { z } from 'zod';

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
