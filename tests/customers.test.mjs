import assert from 'node:assert/strict';
import test from 'node:test';
import { URLSearchParams } from 'node:url';
import {
  customerEndpointAllowed,
  createCustomerClient,
  CustomerApiError,
} from '../packages/api-client/dist/index.js';
import {
  customerPatchSchema,
  customerContactPatchSchema,
  customerAddressPatchSchema,
} from '../packages/validation/dist/index.js';

test('customer patch contracts do not reset omitted fields', () => {
  assert.deepEqual(customerPatchSchema.parse({ displayName: 'New' }), {
    displayName: 'New',
  });
  assert.deepEqual(customerContactPatchSchema.parse({ title: 'New' }), {
    title: 'New',
  });
  assert.deepEqual(customerAddressPatchSchema.parse({ city: 'New' }), {
    city: 'New',
  });
});
test('web customer bridge allowlist is method- and route-specific', () => {
  const root = 'organizations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/customers';
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.ok(customerEndpointAllowed('GET', root));
  assert.ok(customerEndpointAllowed('PATCH', `${root}/${id}`));
  assert.ok(customerEndpointAllowed('POST', `${root}/${id}/archive`));
  for (const [method, path] of [
    ['DELETE', root],
    ['GET', `${root}/${id}/archive`],
    ['POST', `${root}/${id}`],
    ['GET', `${root}/../../platform/organizations`],
    ['PATCH', root],
    ['GET', `${root}/${id}/secret`],
  ])
    assert.equal(customerEndpointAllowed(method, path), false);
});
test('shared customer client forwards pagination and mutations and exposes no error body', async () => {
  const api = createCustomerClient('/api/backend', async (url, options) => {
    assert.ok(url.includes('q=needle'));
    assert.ok(url.includes('cursor='));
    assert.equal(options.method, 'GET');
    return globalThis.Response.json({ items: [], nextCursor: null });
  });
  assert.deepEqual(
    await api.list(
      'organization',
      new URLSearchParams({ q: 'needle', cursor: 'cursor' }),
    ),
    { items: [], nextCursor: null },
  );
  const denied = createCustomerClient(
    '/api/backend',
    async () =>
      new globalThis.Response('private error detail', { status: 403 }),
  );
  await assert.rejects(
    denied.get('org', 'id'),
    (error) =>
      error instanceof CustomerApiError &&
      error.status === 403 &&
      !error.message.includes('private'),
  );
});
