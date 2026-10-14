import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

const config: NextConfig = {
  transpilePackages: ['@rental/i18n'],
};
export default function configuration(phase: string): NextConfig {
  if (phase !== PHASE_PRODUCTION_BUILD) {
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
    if (!/^[a-zA-Z0-9.-]+$/.test(process.env.AUTH0_DOMAIN ?? ''))
      throw new Error('Invalid AUTH0_DOMAIN');
    for (const key of ['APP_BASE_URL', 'API_BASE_URL']) {
      const url = new URL(process.env[key]!);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== '/' ||
        !(
          url.protocol === 'https:' ||
          (url.protocol === 'http:' &&
            ['localhost', '127.0.0.1'].includes(url.hostname))
        )
      )
        throw new Error(`Invalid server configuration: ${key}`);
    }
  }
  return config;
}
