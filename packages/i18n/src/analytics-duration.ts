import { analyticsMessages } from './analytics.js';

export type AnalyticsDurationUnit = 'HOURS' | 'DAYS';
export type AnalyticsDurationMetric =
  | 'observationSeconds'
  | 'rentedSeconds'
  | 'reservedSeconds'
  | 'unrentedSeconds'
  | 'averageRentalSeconds';
type DurationLocale = keyof typeof analyticsMessages;

// Presentation conversion only: never round source intervals or billing units.
export function analyticsDurationValue(
  seconds: number | null,
  unit: AnalyticsDurationUnit,
): number | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  return seconds / (unit === 'HOURS' ? 3600 : 86400);
}

export function formatAnalyticsDuration(
  seconds: number | null,
  unit: AnalyticsDurationUnit,
  locale: DurationLocale,
): string {
  const value = analyticsDurationValue(seconds, unit);
  if (value === null) return '—';
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return value > 0 && value < 0.01
    ? `<${format.format(0.01)}`
    : format.format(value);
}

export function analyticsDurationLabel(
  metric: AnalyticsDurationMetric,
  unit: AnalyticsDurationUnit,
  locale: DurationLocale,
): string {
  return `${analyticsMessages[locale][`finance.${metric}`]} (${analyticsMessages[locale][`finance.${unit}`]})`;
}
