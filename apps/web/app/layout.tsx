import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { translate } from '@rental/i18n';
import './globals.css';

export const metadata: Metadata = { title: translate('en', 'app.title') };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
