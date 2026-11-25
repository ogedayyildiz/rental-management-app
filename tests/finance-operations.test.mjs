import test from 'node:test';
import assert from 'node:assert/strict';
import { taxBreakdown } from '../apps/api/dist/finance/tax.js';
import {
  machinePatchSchema,
  specifiedTaxSchema,
  financeRecordInputSchema,
} from '../packages/validation/dist/index.js';
import { financeOperationsEndpointAllowed } from '../packages/api-client/dist/index.js';
import { tenantPermissions } from '../packages/permissions/dist/index.js';
import { messages } from '../packages/i18n/dist/index.js';

test('every tenant permission has an EN/TR administration label', () => {
  for (const locale of ['en', 'tr'])
    for (const permission of tenantPermissions)
      assert.ok(
        messages[locale]['admin.permission.' + permission],
        `${locale}: ${permission}`,
      );
});
test('VAT arithmetic distinguishes entered net/gross, exact decimal rounding and unknown history', () => {
  assert.deepEqual(taxBreakdown('100', { mode: 'EXCLUSIVE', rate: '20' }), {
    netAmount: '100.00',
    taxAmount: '20.00',
    grossAmount: '120.00',
  });
  assert.deepEqual(taxBreakdown('120', { mode: 'INCLUSIVE', rate: '20' }), {
    netAmount: '100.00',
    taxAmount: '20.00',
    grossAmount: '120.00',
  });
  assert.deepEqual(taxBreakdown('1', { mode: 'INCLUSIVE', rate: '20' }), {
    netAmount: '0.83',
    taxAmount: '0.17',
    grossAmount: '1.00',
  });
  assert.deepEqual(taxBreakdown('0.05', { mode: 'EXCLUSIVE', rate: '10' }), {
    netAmount: '0.05',
    taxAmount: '0.01',
    grossAmount: '0.06',
  });
  assert.deepEqual(
    taxBreakdown('99.99', {
      mode: 'NOT_APPLICABLE',
      reason: 'Recorded non-taxable transaction',
    }),
    { netAmount: '99.99', taxAmount: '0.00', grossAmount: '99.99' },
  );
  assert.equal(taxBreakdown('100', { mode: 'UNSPECIFIED' }), null);
  assert.equal(
    'tax' in machinePatchSchema.parse({ notes: 'Unrelated' }),
    false,
  );
  assert.equal(
    specifiedTaxSchema.safeParse({ mode: 'UNSPECIFIED' }).success,
    false,
  );
  for (const input of [
    { mode: 'EXCLUSIVE', rate: '-1' },
    { mode: 'INCLUSIVE', rate: 20 },
    { mode: 'NOT_APPLICABLE', reason: '' },
    { mode: 'NOT_APPLICABLE', reason: 'valid', rate: '0' },
  ])
    assert.equal(specifiedTaxSchema.safeParse(input).success, false);
});
test('financial bridge only allows explicit records, approval, payment and reversal endpoints', () => {
  const id = '11111111-1111-4111-8111-111111111111',
    root = `organizations/${id}/finance/records`;
  for (const [m, p] of [
    ['GET', root],
    ['GET', root + '/balances'],
    ['GET', root + '/branches'],
    ['POST', root],
    ['PATCH', root + '/' + id],
    ['POST', root + `/${id}/payments/${id}/reverse`],
  ])
    assert.equal(financeOperationsEndpointAllowed(m, p), true);
  for (const [m, p] of [
    ['DELETE', root + '/' + id],
    ['POST', root + '/balances'],
    ['POST', root + '/' + id + '/impersonate'],
    ['GET', root + '/export/raw'],
    ['PATCH', root],
  ])
    assert.equal(financeOperationsEndpointAllowed(m, p), false);
  assert.equal(financeRecordInputSchema.safeParse({}).success, false);
});
