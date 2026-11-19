import {
  operationsDashboardSchema,
  operationsQuerySchema,
  operationsSearchSchema,
  operationsSearchResultSchema,
  notificationPreferencesSchema,
  notificationActionSchema,
} from '@rental/validation';
import type { AuthenticatedPrincipal } from '../access/access.service.js';
import { AccessError } from '../access/contracts.js';
import type { OperationsUnitOfWork } from './contracts.js';
import { deriveOperations } from './attention.js';
function parse<T>(
  schema: {
    safeParse(v: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AccessError('INVALID_INPUT');
  return result.data;
}
export class OperationsService {
  constructor(
    private readonly uow: OperationsUnitOfWork,
    private readonly clock = () => new Date(),
  ) {}
  dashboard(p: AuthenticatedPrincipal, org: unknown, q: unknown = {}) {
    const query = parse(operationsQuerySchema, q);
    return this.uow.run(p, org, async (r, c) => {
      const now = this.clock(),
        preferences = await r.preferences(c);
      const derived = deriveOperations(
        await r.snapshot(c, query, now),
        c.organizationId,
        c.permissions,
        preferences,
        now,
      );
      if (query.branchId)
        for (const metric of derived.metrics)
          metric.href += '&branchId=' + query.branchId;
      const interactions = new Map(
        (await r.interactions(c)).map((v) => [v.key, v]),
      );
      const attention = derived.attention.map((v) => ({
        ...v,
        ...interactions.get(v.key),
      }));
      // Resolved conditions vanish. Muted domains never suppress operational KPI/attention data.
      const notifications = preferences.enabled
        ? attention.filter(
            (v) =>
              preferences.domains.includes(v.domain) &&
              !v.dismissedAt &&
              v.severity !== 'INFO',
          )
        : [];
      return operationsDashboardSchema.parse({
        ...derived,
        preferences,
        attention: attention.slice(0, 200),
        timeline: derived.timeline.slice(0, 200),
        notifications: notifications.slice(0, 200),
        attentionTotal: attention.length,
        timelineTotal: derived.timeline.length,
        notificationTotal: notifications.length,
        unreadTotal: notifications.filter((v) => !v.readAt).length,
      });
    });
  }
  search(p: AuthenticatedPrincipal, org: unknown, q: unknown) {
    const query = parse(operationsSearchSchema, q);
    return this.uow.run(p, org, async (r, c) =>
      operationsSearchResultSchema.parse(await r.search(c, query)),
    );
  }
  savePreferences(p: AuthenticatedPrincipal, org: unknown, body: unknown) {
    const value = parse(notificationPreferencesSchema, body);
    return this.uow.run(p, org, async (r, c) => {
      await r.savePreferences(c, value);
      return value;
    });
  }
  interact(
    p: AuthenticatedPrincipal,
    org: unknown,
    key: string,
    body: unknown,
  ) {
    const { action } = parse(notificationActionSchema, body);
    if (!/^[a-f0-9]{64}$/.test(key)) throw new AccessError('INVALID_INPUT');
    return this.uow.run(p, org, async (r, c) => {
      const now = this.clock(),
        prefs = await r.preferences(c);
      const { attention } = deriveOperations(
        await r.snapshot(c, {}, now),
        c.organizationId,
        c.permissions,
        prefs,
        now,
      );
      if (!attention.some((v) => v.key === key))
        throw new AccessError('NOT_FOUND');
      await r.interact(c, key, action, now);
      return { ok: true };
    });
  }
}
