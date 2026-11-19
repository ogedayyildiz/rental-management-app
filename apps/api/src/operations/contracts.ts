import type {
  TenantContext,
  AuthenticatedPrincipal,
} from '../access/access.service.js';
import type {
  NotificationPreferences,
  OperationsQuery,
  Attention,
} from '@rental/validation';
import type { CurrentTelemetry } from '../devices/current-telemetry.js';
export type OperationsRental = {
  id: string;
  number: string;
  status: string;
  branchId: string | null;
  items: {
    id: string;
    quantity: number;
    plannedStartAt: Date | null;
    plannedEndAt: Date | null;
    assignments: {
      machineId: string;
      actualStartAt: Date | null;
      actualEndAt: Date | null;
    }[];
  }[];
};
export type OperationsMachine = {
  id: string;
  fleetNumber: string;
  branchId: string | null;
  lifecycleState: string;
  rentalState: string;
  serviceState: string;
  updatedAt: Date;
  serviceRestrictions?: { id: string; createdAt: Date }[];
};
export type OperationsWorkOrder = {
  id: string;
  number: string;
  status: string;
  plannedAt: Date | null;
  dueAt: Date | null;
  startedAt: Date | null;
  machine: { fleetNumber: string };
};
export type OperationsPlan = {
  id: string;
  machineId: string;
  nextDueAt: Date;
  plan: { name: string };
  machine: { fleetNumber: string };
};
export interface OperationsSnapshot {
  timezone: string;
  branches: { id: string; name: string }[];
  rentals: OperationsRental[];
  machines: OperationsMachine[];
  orders: OperationsWorkOrder[];
  plans: OperationsPlan[];
  telemetry: Map<string, CurrentTelemetry>;
  available: number | null;
}
export interface OperationsReader {
  snapshot(
    c: TenantContext,
    q: OperationsQuery,
    now: Date,
  ): Promise<OperationsSnapshot>;
  search(
    c: TenantContext,
    q: OperationsQuery & { q: string },
  ): Promise<{
    items: {
      source: 'CUSTOMER' | 'MACHINE' | 'RENTAL' | 'MAINTENANCE' | 'DEVICE';
      id: string;
      label: string;
      href: string;
    }[];
    limited: boolean;
  }>;
  preferences(c: TenantContext): Promise<NotificationPreferences>;
  savePreferences(
    c: TenantContext,
    value: NotificationPreferences,
  ): Promise<void>;
  interactions(
    c: TenantContext,
  ): Promise<
    Pick<Attention, 'key' | 'readAt' | 'acknowledgedAt' | 'dismissedAt'>[]
  >;
  interact(
    c: TenantContext,
    key: string,
    action: 'READ' | 'UNREAD' | 'ACKNOWLEDGE' | 'DISMISS',
    now: Date,
  ): Promise<void>;
}
export abstract class OperationsUnitOfWork {
  abstract run<T>(
    p: AuthenticatedPrincipal,
    org: unknown,
    fn: (r: OperationsReader, c: TenantContext) => Promise<T>,
  ): Promise<T>;
}

// A future delivery adapter accepts already authorized, preference-filtered content.
// This phase delivers only through the authenticated in-app read API.
export interface NotificationDelivery {
  deliver(
    recipient: { organizationId: string; membershipId: string },
    items: readonly Attention[],
  ): Promise<void>;
}
