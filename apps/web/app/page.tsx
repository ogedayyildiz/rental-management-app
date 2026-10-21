import Link from 'next/link';
import { translate } from '@rental/i18n';
import { Account } from './account';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold">{translate('en', 'app.title')}</h1>
      <Account />
      <Link href="/rentals" className="mt-6 mr-6 inline-block underline">
        {translate('en', 'rentals.title')}
      </Link>
      <Link href="/machines" className="mt-6 mr-6 inline-block underline">
        {translate('en', 'machines.title')}
      </Link>
      <a href="/customers" className="mt-6 inline-block underline">
        {translate('en', 'customers.title')}
      </a>
    </main>
  );
}
