import { Suspense } from 'react';
import { AppShell } from './app-shell';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { translate } from '@rental/i18n';
import './globals.css';

export const metadata: Metadata = { title: translate('en', 'app.title') };
// Per-response CSP nonces must never be embedded in a shared static HTML artifact.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
