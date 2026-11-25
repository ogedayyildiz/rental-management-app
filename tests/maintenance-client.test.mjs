import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { maintenanceEndpointAllowed } from '../packages/api-client/dist/maintenance.js';
import { workOrderPatchSchema } from '../packages/validation/dist/index.js';
import { maintenanceReport } from '../apps/api/dist/infrastructure/maintenance-report.js';
import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
test('maintenance bridge method and path allowlist excludes foreign domains and arbitrary actions', () => {
  const root = 'organizations/' + randomUUID() + '/maintenance',
    id = randomUUID();
  for (const path of [
    root,
    root + '/plans',
    root + '/' + id,
    root + '/machines/' + id + '/export/pdf',
    root + '/machines/' + id + '/export/xlsx',
  ])
    assert.equal(maintenanceEndpointAllowed('GET', path), true);
  assert.equal(maintenanceEndpointAllowed('DELETE', root + '/' + id), false);
  assert.equal(
    maintenanceEndpointAllowed('POST', root + '/' + id + '/reopen'),
    false,
  );
  assert.equal(
    maintenanceEndpointAllowed(
      'GET',
      root + '/machines/' + id + '/export/html',
    ),
    false,
  );
  assert.equal(
    maintenanceEndpointAllowed('PATCH', root + '/' + id + '/costs'),
    false,
  );
  assert.equal(maintenanceEndpointAllowed('GET', 'https://example.com'), false);
});
test('maintenance patch retains omitted fields', () => {
  assert.deepEqual(workOrderPatchSchema.parse({ title: 'Corrected' }), {
    title: 'Corrected',
  });
  assert.equal(workOrderPatchSchema.safeParse({}).success, false);
});
test('maintenance PDF and XLSX preserve Turkish identifiers and render untrusted spreadsheet text as text', async () => {
  const data = {
    organizationId: randomUUID(),
    generatedBy: randomUUID(),
    generatedAt: '2030-06-10T12:00:00.000Z',
    machine: {
      id: randomUUID(),
      fleetNumber: 'UM-TEST-001',
      manufacturer: 'Üretici',
      model: 'İş makinesi',
      serialNumber: null,
      serviceState: 'NORMAL',
    },
    records: [
      {
        id: randomUUID(),
        number: 'WO-2030-000001',
        title: '=HYPERLINK("bad")',
        type: 'INSPECTION',
        status: 'COMPLETED',
        priority: 'NORMAL',
        plannedAt: null,
        dueAt: null,
        startedAt: '2030-06-10T11:00:00.000Z',
        completedAt: '2030-06-10T12:00:00.000Z',
        branch: 'İstanbul',
        materials: [],
        tasks: [],
      },
    ],
  };
  const pdf = await maintenanceReport(data, 'pdf');
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const excel = await maintenanceReport(data, 'xlsx');
  const ExcelJS = require('exceljs');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(excel);
  assert.equal(
    book.getWorksheet('Work orders').getCell('C2').value,
    data.records[0].title,
  );
  assert.equal(book.getWorksheet('Machine').getCell('B5').value, 'İş makinesi');
});
