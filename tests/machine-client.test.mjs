import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMachineClient,
  MachineApiError,
  machineEndpointAllowed,
} from '../packages/api-client/dist/index.js';
const id = '11111111-1111-4111-8111-111111111111';
test('machine restore bridge allowlist and explicit safe error codes', async () => {
  const path = 'organizations/' + id + '/machines/' + id + '/restore';
  assert.equal(machineEndpointAllowed('POST', path), true);
  assert.equal(machineEndpointAllowed('GET', path), false);
  assert.equal(machineEndpointAllowed('PATCH', path), false);
  for (const code of [
    'MACHINE_COMMITTED',
    'MACHINE_ARCHIVED',
    'MACHINE_COMMITMENT_CONFLICT',
    'private database error',
  ]) {
    const client = createMachineClient(
      '/api/backend',
      async () =>
        new globalThis.Response(JSON.stringify({ code, detail: 'private' }), {
          status: 409,
        }),
    );
    await assert.rejects(
      client.restore(id, id, { reasonCode: 'INCORRECT_SALE' }),
      (error) => {
        assert.ok(error instanceof MachineApiError);
        assert.equal(error.status, 409);
        assert.equal(
          error.code,
          code === 'private database error' ? undefined : code,
        );
        assert.ok(!error.message.includes('private'));
        return true;
      },
    );
  }
});
