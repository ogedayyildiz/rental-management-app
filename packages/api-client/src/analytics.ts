import {
  analyticsReportSchema,
  type AnalyticsReport,
} from '@rental/validation';
export function analyticsEndpointAllowed(
  method: string,
  path: string,
): boolean {
  return (
    method === 'GET' &&
    /^organizations\/[0-9a-f-]{36}\/finance(?:\/export)?$/.test(path)
  );
}
export function createAnalyticsClient(
  baseUrl: string,
  transport: typeof fetch = fetch,
) {
  const path = (org: string, query: URLSearchParams, exporting = false) =>
    `${baseUrl.replace(/\/$/, '')}/organizations/${encodeURIComponent(org)}/finance${exporting ? '/export' : ''}?${query}`;
  return {
    async report(
      org: string,
      query: URLSearchParams,
    ): Promise<AnalyticsReport> {
      const r = await transport(path(org, query), { cache: 'no-store' });
      if (!r.ok) throw Error(`ANALYTICS_${r.status}`);
      return analyticsReportSchema.parse(await r.json());
    },
    exportUrl: (org: string, query: URLSearchParams) => path(org, query, true),
  };
}
