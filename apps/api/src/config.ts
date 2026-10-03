function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  isProduction: process.env.NODE_ENV === 'production',
  /**
   * Development stand-in for authentication: requests act as this tenant.
   * Ignored in production.
   */
  devOrgId: process.env.DEV_ORG_ID || undefined,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:8081').split(','),
};
