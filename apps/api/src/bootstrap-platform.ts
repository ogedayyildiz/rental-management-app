import { parseArgs } from 'node:util';
import { createDatabase } from '@rental/database';
import { readAuth0Environment } from '@rental/config';
import { Auth0IdentityVerifier } from './authentication/auth0.verifier.js';
import { bootstrapLogin } from './authentication/bootstrap-login.js';
import { bootstrapPlatformOperator } from './infrastructure/prisma.platform-bootstrap.js';

async function main() {
  const { values } = parseArgs({
    options: {
      subject: { type: 'string' },
      confirm: { type: 'boolean', default: false },
    },
  });
  const subject = values.subject;
  if (
    !process.stdin.isTTY ||
    !values.confirm ||
    !subject ||
    subject.length > 255
  )
    throw new Error('Interactive terminal, --subject and --confirm required');
  const configuration = readAuth0Environment(process.env);
  const clientId = process.env['AUTH0_CLIENT_ID'];
  const clientSecret = process.env['AUTH0_CLIENT_SECRET'];
  if (
    !clientId ||
    !clientSecret ||
    !configuration.clientIds.includes(clientId) ||
    new URL(configuration.issuer).hostname !== process.env['AUTH0_DOMAIN']
  )
    throw new Error('Invalid web application configuration');
  const database = createDatabase(process.env['DATABASE_URL']);
  try {
    // Refuse before prompting for login; the transaction rechecks after login.
    if (
      (await database.platformAccess.count()) ||
      (await database.auditEvent.count({
        where: { action: 'PLATFORM_OPERATOR_BOOTSTRAPPED' },
      }))
    )
      throw new Error('Platform access already provisioned');
    const credential = await bootstrapLogin(
      { ...configuration, clientId, clientSecret },
      (url) => {
        process.stdout.write(
          `Open this authorization URL in your browser and sign in as the intended operator:\n${url}\n`,
        );
      },
    );
    const result = await bootstrapPlatformOperator(
      database,
      new Auth0IdentityVerifier(configuration),
      credential,
      subject,
    );
    process.stdout.write(
      `Platform operator provisioned. User ID: ${result.userId}. No tenant membership granted.\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

try {
  await main();
} catch {
  // Provider/Prisma errors can contain credentials or request data. Never print them.
  process.stderr.write(
    'Bootstrap did not complete. Check configuration, expected subject, verified email, --confirm, database seed and whether platform access already exists. See docs/14-AUTH0-LOCAL-VERIFICATION.md.\n',
  );
  process.exitCode = 1;
}
