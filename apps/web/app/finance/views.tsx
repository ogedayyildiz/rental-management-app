'use client';
import { useEffect, useRef } from 'react';
import { translate, type Locale } from '@rental/i18n';
import type {
  AnalyticsMoney,
  AnalyticsReport,
  AnalyticsRow,
} from '@rental/validation';
export function MoneyValues({
  values,
  locale,
}: {
  values: AnalyticsMoney[];
  locale: Locale;
}) {
  return (
    <>
      {values.map((v) => (
        <dl className="finance-values" key={v.currency}>
          {(
            [
              'estimatedContractedValue',
              'estimatedAccruedValue',
              'estimatedCompletedValue',
              'maintenanceCost',
              'estimatedContribution',
            ] as const
          ).map((k) =>
            v[k] !== undefined ? (
              <div key={k}>
                <dt>{translate(locale, `finance.${k}`)}</dt>
                <dd>
                  {v[k]} {v.currency}
                </dd>
              </div>
            ) : null,
          )}
          {v.valueTypes?.length ? (
            <div>
              <dt>{translate(locale, 'finance.valueTypes')}</dt>
              <dd>
                {v.valueTypes
                  .map((x) => translate(locale, `finance.${x}`))
                  .join(', ')}
              </dd>
            </div>
          ) : null}
        </dl>
      ))}
    </>
  );
}
export function Performance({
  row,
  locale,
  timezone = 'UTC',
}: {
  row: AnalyticsRow;
  locale: Locale;
  timezone?: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <>
      <MoneyValues values={row.values} locale={locale} />
      {row.acquisitionCost && (
        <dl>
          <dt>{t('finance.acquisitionCost')}</dt>
          <dd>
            {row.acquisitionCost
              .map((n) => n.amount + ' ' + n.currency)
              .join(' · ') || t('finance.unknown')}
          </dd>
        </dl>
      )}
      {row.mixedCurrencies && <p>{t('finance.mixed')}</p>}
      {row.operatingHours && (
        <p>
          {t('finance.operatingHours')}: {row.operatingHours.value} ·{' '}
          {new Intl.DateTimeFormat(locale, {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(row.operatingHours.recordedAt))}{' '}
          {row.operatingHours.stale ? t('finance.stale') : ''}
        </p>
      )}
      <dl className="finance-operational">
        {(
          ['rentalCount', 'activeRentals', 'averageRentalSeconds'] as const
        ).map((k) => (
          <div key={k}>
            <dt>{t(`finance.${k}`)}</dt>
            <dd>{row[k] ?? '—'}</dd>
          </div>
        ))}
        <div>
          <dt>{t('finance.utilization')}</dt>
          <dd>{row.utilization.percentage ?? '—'}</dd>
        </div>
        {(
          [
            'observationSeconds',
            'rentedSeconds',
            'reservedSeconds',
            'unrentedSeconds',
            'excludedMachines',
          ] as const
        ).map((k) => (
          <div key={k}>
            <dt>{t(`finance.${k}`)}</dt>
            <dd>{row.utilization[k]}</dd>
          </div>
        ))}
      </dl>
      {row.lifetime && (
        <details>
          <summary>{t('finance.lifetime')}</summary>
          <MoneyValues values={row.lifetime.values} locale={locale} />
          {row.lifetime.recovery !== undefined && (
            <dl>
              <dt>{t('finance.recovery')}</dt>
              <dd>
                {row.lifetime.recovery?.percentage !== null &&
                row.lifetime.recovery?.percentage !== undefined
                  ? row.lifetime.recovery.percentage + '%'
                  : t('finance.unknown')}
              </dd>
              <dt>{t('finance.remaining')}</dt>
              <dd>
                {row.lifetime.recovery?.remaining ?? t('finance.unknown')}{' '}
                {row.lifetime.recovery?.currency}
              </dd>
            </dl>
          )}
        </details>
      )}
    </>
  );
}
export function Trend({
  report,
  locale,
  currency,
}: {
  report: AnalyticsReport;
  locale: Locale;
  currency: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true,
      dispose: (() => void) | undefined;
    void Promise.all([
      import('echarts/core'),
      import('echarts/charts'),
      import('echarts/components'),
      import('echarts/renderers'),
    ]).then(([core, charts, components, renderers]) => {
      if (!live || !ref.current) return;
      core.use([
        charts.BarChart,
        components.GridComponent,
        components.TooltipComponent,
        renderers.SVGRenderer,
      ]);
      const chart = core.init(ref.current, undefined, { renderer: 'svg' });
      chart.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: report.trends.map((t) =>
            new Intl.DateTimeFormat(locale, {
              timeZone: report.timezone,
              month: 'short',
              year: 'numeric',
            }).format(new Date(t.from)),
          ),
        },
        yAxis: { type: 'value' },
        series: [
          {
            type: 'bar',
            name: translate(
              locale,
              currency
                ? 'finance.estimatedCompletedValue'
                : 'finance.utilization',
            ),
            data: report.trends.map((t) =>
              Number(
                currency
                  ? (t.values.find((v) => v.currency === currency)
                      ?.estimatedCompletedValue ?? '0')
                  : (t.utilization.percentage ?? '0'),
              ),
            ),
          },
        ],
      });
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(ref.current);
      dispose = () => {
        observer.disconnect();
        chart.dispose();
      };
    });
    return () => {
      live = false;
      dispose?.();
    };
  }, [report, locale, currency]);
  return (
    <div
      ref={ref}
      className="finance-chart"
      role="img"
      aria-label={translate(locale, 'finance.trends')}
    />
  );
}
