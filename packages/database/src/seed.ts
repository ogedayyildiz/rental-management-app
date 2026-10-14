import { tenantPermissions, platformPermissions } from '@rental/permissions';
import { createDatabase } from './index.js';

const database = createDatabase(process.env['DATABASE_URL']);
try {
  await database.$transaction(async (tx) => {
    for (const [scope, keys] of [
      ['TENANT', tenantPermissions],
      ['PLATFORM', platformPermissions],
    ] as const) {
      for (const key of keys) {
        await tx.permission.upsert({
          where: { key },
          create: { key, scope },
          update: {},
        });
      }
    }
  });
} finally {
  await database.$disconnect();
}
