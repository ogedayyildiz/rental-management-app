import { translate, type Locale } from '@rental/i18n';
import type { AnalyticsReport } from '@rental/validation';

export function TransportSummary({
  rows,
  locale,
  visibility,
}: {
  rows: NonNullable<AnalyticsReport['transportation']>;
  locale: Locale;
  visibility: AnalyticsReport['visibility'];
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <section aria-label={t('transport.title')}>
      <h2>{t('transport.title')}</h2>
      <p>{t('transport.estimateHint')}</p>
      <p>{t('transport.periodHint')}</p>
      {!rows.length ? (
        <p>{t('transport.empty')}</p>
      ) : (
        <div className="finance-table">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('rentals.state')}</th>
                <th scope="col">{t('finance.currency')}</th>
                <th scope="col">{t('transport.count')}</th>
                {visibility.pricing && (
                  <th scope="col">{t('transport.customerNet')}</th>
                )}
                {visibility.transportCosts && (
                  <>
                    <th scope="col">{t('transport.supplierNet')}</th>
                    <th scope="col">{t('transport.missing')}</th>
                  </>
                )}
                {visibility.transportCosts && visibility.pricing && (
                  <th scope="col">{t('transport.margin')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.status + r.currency}>
                  <td>{t(`rentals.${r.status}`)}</td>
                  <td>{t(`currency.${r.currency}`)}</td>
                  <td>{r.count}</td>
                  {visibility.pricing && <td>{r.customerNet}</td>}
                  {visibility.transportCosts && (
                    <>
                      <td>{r.supplierNet ?? t('finance.unknown')}</td>
                      <td>{r.missingSupplierQuotes}</td>
                    </>
                  )}
                  {visibility.transportCosts && visibility.pricing && (
                    <td>{r.estimatedMargin ?? t('finance.unknown')}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
