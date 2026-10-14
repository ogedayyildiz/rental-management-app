import { translate } from '@rental/i18n';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold">{translate('en', 'app.title')}</h1>
      <p className="mt-4 text-slate-600">
        {translate('en', 'bootstrap.description')}
      </p>
    </main>
  );
}
