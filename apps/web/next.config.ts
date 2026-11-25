import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { resolve } from 'node:path';
import { validateWebEnvironment } from '@rental/config';

const config: NextConfig = {
  transpilePackages: ['@rental/i18n'],
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};
export default function configuration(phase: string): NextConfig {
  // Images build without credentials; instrumentation.ts validates standalone startup.
  if (phase !== PHASE_PRODUCTION_BUILD) validateWebEnvironment(process.env);
  return config;
}
