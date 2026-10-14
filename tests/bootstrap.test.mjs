import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { readServiceEnvironment } = require('../packages/config/dist/index.js');
const root = fileURLToPath(new URL('../', import.meta.url));

test('service configuration rejects invalid ports without exposing input', () => {
  for (const port of ['', '0', '-1', '65536', '1.5', 'secret-invalid-value']) {
    assert.throws(
      () => readServiceEnvironment({ API_PORT: port }, 'API_PORT', 3001),
      { message: 'Invalid service configuration: HOST or API_PORT' },
    );
  }
});

async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

for (const service of ['api', 'telemetry', 'worker']) {
  test(
    `${service} starts from compiled output and exposes liveness only`,
    { timeout: 45000 },
    async () => {
      const port = await freePort();
      const child = spawn(process.execPath, [`apps/${service}/dist/main.js`], {
        cwd: root,
        env: {
          ...process.env,
          HOST: '127.0.0.1',
          // Synthetic configuration only; no live provider calls in liveness tests.
          AUTH0_ISSUER: 'https://identity.example.test/',
          AUTH0_AUDIENCE: 'test-api',
          AUTH0_ALLOWED_CLIENT_IDS: 'test-web',
          [`${service.toUpperCase()}_PORT`]: String(port),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let output = '';
      child.stdout.on('data', (chunk) => {
        output = (output + chunk).slice(-5000);
      });
      child.stderr.on('data', (chunk) => {
        output = (output + chunk).slice(-5000);
      });
      const exited = once(child, 'exit');
      try {
        const url = `http://127.0.0.1:${port}`;
        let health;
        for (let attempt = 0; attempt < 300; attempt += 1) {
          assert.equal(child.exitCode, null, output);
          try {
            health = await fetch(`${url}/health`);
            break;
          } catch {
            await delay(100);
          }
        }
        assert.ok(health, `Service did not start: ${output}`);
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok', service });
        const unknown = await fetch(`${url}/machines`);
        assert.equal(unknown.status, 404);
        await unknown.text();
        const mutation = await fetch(`${url}/health`, { method: 'POST' });
        assert.equal(mutation.status, 404);
        await mutation.text();
      } finally {
        child.kill();
        await exited;
      }
    },
  );
}
