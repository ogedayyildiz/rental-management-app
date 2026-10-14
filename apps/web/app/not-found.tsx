import { translate } from '@rental/i18n';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold">
        {translate('en', 'common.notFound')}
      </h1>
    </main>
  );
}
