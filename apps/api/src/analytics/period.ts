import type { AnalyticsQuery } from '@rental/validation';
import { AccessError } from '../access/contracts.js';
export function localMidnight(
  year: number,
  month: number,
  day: number,
  timezone: string,
): number {
  const target = Date.UTC(year, month, day);
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(
      format.formatToParts(new Date(candidate)).map((p) => [p.type, p.value]),
    );
    const represented = Date.UTC(
      Number(p['year']),
      Number(p['month']) - 1,
      Number(p['day']),
      Number(p['hour']),
      Number(p['minute']),
      Number(p['second']),
    );
    const delta = target - represented;
    if (!delta) return candidate;
    candidate += delta;
  }
  throw new AccessError('INVALID_INPUT');
}
export function reportingPeriod(
  q: AnalyticsQuery,
  now: Date,
  timezone: string,
): [number, number] {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const y = Number(parts['year']),
    m = Number(parts['month']) - 1;
  let from: number, to: number;
  if (q.preset === 'CUSTOM') {
    from = Date.parse(q.from!);
    to = Date.parse(q.to!);
  } else if (q.preset === 'PREVIOUS_MONTH') {
    from = localMidnight(y, m - 1, 1, timezone);
    to = localMidnight(y, m, 1, timezone);
  } else {
    from = localMidnight(
      y,
      q.preset === 'YEAR_TO_DATE'
        ? 0
        : q.preset === 'LAST_12_MONTHS'
          ? m - 11
          : m,
      1,
      timezone,
    );
    to =
      q.preset === 'THIS_MONTH'
        ? localMidnight(y, m + 1, 1, timezone)
        : now.getTime();
  }
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    to <= from ||
    to - from > 366 * 86400000
  )
    throw new AccessError('INVALID_INPUT');
  return [from, to];
}
export function monthRanges(
  from: number,
  to: number,
  timezone: string,
): [number, number][] {
  const ranges: [number, number][] = [];
  let start = from;
  while (start < to) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
      })
        .formatToParts(new Date(start))
        .map((p) => [p.type, p.value]),
    );
    const end = Math.min(
      to,
      localMidnight(Number(p['year']), Number(p['month']), 1, timezone),
    );
    if (end <= start) throw new AccessError('INVALID_INPUT');
    ranges.push([start, end]);
    start = end;
  }
  return ranges;
}
