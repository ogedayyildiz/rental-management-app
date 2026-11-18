import { createDatabase } from '@rental/database';
import { fixtureAdapter, ingest, simulatedFrame } from './ingestion.js';
import { identifierSchema } from '@rental/validation';
const url = new URL(process.env['DATABASE_URL'] ?? '');
if (
  process.env['NODE_ENV'] === 'production' ||
  !['127.0.0.1', 'localhost'].includes(url.hostname)
)
  throw Error('Local simulator only');
const [org, external, at, scenario] = process.argv.slice(2);
if (
  !org ||
  !identifierSchema.safeParse(org).success ||
  !external ||
  !at ||
  !scenario
)
  throw Error(
    'Expected organization UUID, registered simulator identifier, UTC observation time, scenario',
  );
const recorded = new Date(at),
  step = ['drive', 'discharge', 'charge'].indexOf(scenario);
if (step < 0 && !['duplicate', 'late', 'stale', 'malformed'].includes(scenario))
  throw Error('Unknown scenario');
const db = createDatabase(url.href);
try {
  const frame = simulatedFrame(
    Math.max(step, 0),
    new Date(
      recorded.getTime() -
        (scenario === 'late' ? 1000 : scenario === 'stale' ? 86400000 : 0),
    ),
  );
  const submit = () =>
    ingest(
      db,
      { organizationId: org, externalId: external, provider: 'simulator' },
      fixtureAdapter('simulator'),
      scenario === 'malformed' ? {} : frame,
    );
  await submit();
  if (scenario === 'duplicate') await submit();
} finally {
  await db.$disconnect();
}
