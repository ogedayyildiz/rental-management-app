import type { SourceBinding, TelemetryAdapter } from './ingestion.js';
import { fixtureAdapter } from './ingestion.js';

// Transport authentication/tenant resolution belongs to the deployment adapter.
// These contracts do not specify any undocumented on-wire message or cloud endpoint.
export interface RuptelaTcpSource {
  readonly transport: 'proprietary-tcp';
  bindAuthenticatedPeer(peer: unknown): Promise<SourceBinding | null>;
  readonly decoder: TelemetryAdapter;
}
export interface XtellioCloudSource {
  readonly transport: 'cloud-api';
  bindConfiguredAccountDevice(
    externalId: string,
  ): Promise<SourceBinding | null>;
  readonly decoder: TelemetryAdapter;
}
// Canonical fixture input only. Neither adapter accepts real vendor traffic.
export const ruptelaFixture = fixtureAdapter('proprietary-tcp');
export const xtellioFixture = fixtureAdapter('cloud-api');
