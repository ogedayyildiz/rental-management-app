import { createRequire } from 'node:module';
import { assertE2E, identityFor } from './isolation.mjs';
import { createDatabase } from '../../packages/database/dist/index.js';
import { AppModule } from '../../apps/api/dist/app.module.js';
import { DATABASE } from '../../apps/api/dist/foundation.module.js';
import { IdentityVerifier } from '../../apps/api/dist/access/contracts.js';
assertE2E(process.env);
const require = createRequire(
  new URL('../../apps/api/package.json', import.meta.url),
);
const { Test } = require('@nestjs/testing');
const db = createDatabase(process.env.DATABASE_URL);
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(DATABASE)
  .useValue(db)
  .overrideProvider(IdentityVerifier)
  .useValue({ verify: async (token) => identityFor(process.env, token) })
  .compile();
const app = module.createNestApplication({ logger: false });
await app.listen(3101, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
