import { expectCurrencyChoices } from './currency-helpers.mjs';
import { test, expect, json } from './fixtures.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import { createRequire } from 'node:module';
const apiRequire = createRequire(
  new URL('../../apps/api/package.json', import.meta.url),
);
export async function createWork(page, data, title) {
  await page.goto('/maintenance');
  await page
    .getByRole('button', { name: 'Create work order', exact: true })
    .click();
  const form = page.locator('form').filter({
    has: page.getByRole('heading', {
      name: 'Create work order',
      exact: true,
    }),
  });
  await form
    .getByRole('combobox', { name: 'Machines', exact: true })
    .selectOption(data.workMachine.id);
  await form.getByLabel('Maintenance', { exact: true }).fill(title);
  await form
    .getByRole('combobox', { name: 'Responsible branch', exact: true })
    .selectOption(data.north.id);
  await form.getByLabel('Planned start (UTC)').fill('2032-01-02T10:00');
  await form.getByLabel('Planned end (UTC)').fill('2032-01-03T10:00');
  await form.getByLabel('Due date (UTC)').fill('2020-01-01T10:00');
  await form.getByLabel('Checklist (one task per line)').fill('Inspect brakes');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: new RegExp(title) }),
  ).toBeVisible();
}
test('work order schedule/start/complete, costs, history and meaningful exports', async ({
  page,
  data,
}, info) => {
  await createWork(page, data, 'Browser service inspection');
  const order = (
    await json(
      page,
      `organizations/${data.org.id}/maintenance?q=Browser service inspection`,
    )
  ).body.items[0];
  await page
    .getByRole('button', { name: 'Accept / open', exact: true })
    .click();
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Start work', exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await json(
            page,
            `organizations/${data.org.id}/machines/${data.workMachine.id}`,
          )
        ).body.serviceState,
    )
    .toBe('OUT_OF_SERVICE');
  await page.getByLabel('Inspect brakes', { exact: true }).click();
  await expect(
    page.getByLabel('Inspect brakes', { exact: true }),
  ).toBeChecked();
  const costs = page
    .locator('form')
    .filter({ has: page.getByLabel('Amount', { exact: true }) });
  await costs.getByLabel('Amount', { exact: true }).fill('78901.123456');
  const currency = costs.getByRole('combobox', {
    name: 'Currency',
    exact: true,
  });
  await expectCurrencyChoices(currency);
  await currency.selectOption({ label: 'TL' });
  await costs
    .getByRole('combobox', { name: 'VAT treatment', exact: true })
    .selectOption('EXCLUSIVE');
  await costs.getByLabel('VAT rate (%)', { exact: true }).fill('0');
  await costs.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .getByLabel('Completion notes / cancellation reason')
    .fill('Brake inspection complete');
  await page
    .getByRole('button', { name: 'Complete work order', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await json(
            page,
            `organizations/${data.org.id}/machines/${data.workMachine.id}`,
          )
        ).body.serviceState,
    )
    .toBe('NORMAL');
  for (const format of ['PDF', 'XLSX']) {
    const mime =
      format === 'PDF'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const responsePromise = page.waitForResponse((r) =>
      r.url().includes('/export/' + format.toLowerCase()),
    );
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('link', { name: `Technical history ${format}`, exact: true })
      .click();
    expect((await responsePromise).headers()['content-type']).toContain(mime);
    const download = await downloadPromise;
    const path = info.outputPath(`history.${format.toLowerCase()}`);
    await download.saveAs(path);
    const bytes = await readFile(path);
    expect(bytes.length).toBeGreaterThan(1000);
    if (format === 'XLSX') {
      const Excel = apiRequire('exceljs');
      const book = new Excel.Workbook();
      await book.xlsx.load(bytes);
      const text = JSON.stringify(
        book.worksheets.map((s) => s.getSheetValues()),
      );
      expect(text).toContain(order.number);
      expect(text).toContain('Browser service inspection');
      expect(text).not.toContain('78901.123456');
    } else {
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      const loading = getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: true,
      });
      const pdf = await loading.promise;
      let text = '';
      for (let n = 1; n <= pdf.numPages; n++) {
        const sheet = await pdf.getPage(n);
        text += (await sheet.getTextContent()).items
          .map((x) => ('str' in x ? x.str : ''))
          .join(' ');
        const viewport = sheet.getViewport({ scale: 1.25 });
        const canvas = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await sheet.render({ canvasContext: canvas.getContext('2d'), viewport })
          .promise;
        const png = info.outputPath(`history-page-${n}.png`);
        await writeFile(png, canvas.toBuffer('image/png'));
        await info.attach(`PDF page ${n}`, {
          path: png,
          contentType: 'image/png',
        });
      }
      expect(text).toContain(order.number);
      expect(text).toContain('Browser service inspection');
      expect(text).not.toContain('78901.123456');
      await loading.destroy();
    }
    await info.attach(`history-${format}`, {
      path,
      contentType:
        format === 'PDF'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
  await page.goto(
    `/machines/${data.workMachine.id}?organizationId=${data.org.id}`,
  );
  await expect(
    page.getByRole('link', { name: new RegExp(order.number) }),
  ).toBeVisible();
});
test('cancel releases only its own restriction; overdue work is server filtered', async ({
  page,
  data,
}) => {
  await createWork(page, data, 'Browser cancelled service');
  const base = `organizations/${data.org.id}/maintenance`;
  const order = (await json(page, base + '?q=Browser cancelled service')).body
    .items[0];
  const block = await json(
    page,
    `${base}/machines/${data.workMachine.id}/blocks`,
    'POST',
    { state: 'SERVICE_BLOCKED', reason: 'Independent inspection restriction' },
  );
  expect(block.status).toBe(201);
  await page
    .getByRole('button', { name: 'Accept / open', exact: true })
    .click();
  await page
    .getByLabel('Completion notes / cancellation reason')
    .fill('Duplicate report');
  await page
    .getByRole('button', { name: 'Cancel work order', exact: true })
    .click();
  await expect
    .poll(async () => (await json(page, base + '/' + order.id)).body.status)
    .toBe('CANCELLED');
  expect(
    (
      await json(
        page,
        `organizations/${data.org.id}/machines/${data.workMachine.id}`,
      )
    ).body.serviceState,
  ).toBe('SERVICE_BLOCKED');
  expect(
    (await json(page, base + '?overdue=true')).body.items.some(
      (x) => x.id === order.id,
    ),
  ).toBe(false);
  expect(
    (
      await json(
        page,
        `${base}/machines/${data.workMachine.id}/blocks/${block.body.id}/release`,
        'POST',
        { reason: 'Inspection cleared' },
      )
    ).status,
  ).toBe(201);
});
