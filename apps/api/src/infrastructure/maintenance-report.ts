import { translate } from '@rental/i18n';
import type { Locale, TranslationKey } from '@rental/i18n';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import type { MaintenanceService } from '../maintenance/maintenance.service.js';
type Report = Awaited<ReturnType<MaintenanceService['report']>>;
export async function maintenanceReport(
  data: Report,
  format: 'pdf' | 'xlsx',
  locale: Locale = 'en',
): Promise<Buffer> {
  const t = (key: TranslationKey) => translate(locale, key);
  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Rental Management';
    workbook.created = new Date(data.generatedAt);
    const summary = workbook.addWorksheet(t('maintenance.reportMachine'));
    summary.columns = [
      { header: t('maintenance.reportField'), key: 'field', width: 28 },
      { header: t('maintenance.reportValue'), key: 'value', width: 65 },
    ];
    for (const [field, value] of Object.entries({
      ...data.machine,
      organizationId: data.organizationId,
      generatedBy: data.generatedBy,
      generatedAt: data.generatedAt,
      profile: 'TECHNICAL_HISTORY',
    }))
      summary.addRow({
        field: t(
          (
            {
              id: 'maintenance.reportId',
              fleetNumber: 'maintenance.reportFleet',
              manufacturer: 'maintenance.reportManufacturer',
              model: 'maintenance.reportModel',
              serialNumber: 'maintenance.reportSerial',
              serviceState: 'machines.serviceState',
              organizationId: 'maintenance.reportOrganization',
              generatedBy: 'maintenance.reportActor',
              generatedAt: 'maintenance.reportGenerated',
              profile: 'maintenance.reportProfile',
            } as Record<string, TranslationKey>
          )[field]!,
        ),
        value,
      });
    const sheet = workbook.addWorksheet(t('maintenance.reportOrders'));
    sheet.columns = [
      { header: t('maintenance.reportId'), key: 'id', width: 38 },
      { header: t('maintenance.number'), key: 'number', width: 22 },
      { header: t('maintenance.title'), key: 'title', width: 40 },
      { header: t('maintenance.type'), key: 'type', width: 20 },
      { header: t('rentals.state'), key: 'status', width: 20 },
      { header: t('maintenance.plannedAt'), key: 'plannedAt', width: 28 },
      { header: t('maintenance.dueAt'), key: 'dueAt', width: 28 },
      { header: t('maintenance.start'), key: 'startedAt', width: 28 },
      { header: t('maintenance.complete'), key: 'completedAt', width: 28 },
      { header: t('rentals.branch'), key: 'branch', width: 24 },
    ];
    for (const row of data.records) sheet.addRow(row);
    const parts = workbook.addWorksheet(t('maintenance.reportMaterials'));
    parts.columns = [
      { header: t('maintenance.number'), key: 'number', width: 22 },
      { header: t('maintenance.materials'), key: 'description', width: 40 },
      { header: t('maintenance.partNumber'), key: 'partNumber', width: 24 },
      { header: t('maintenance.quantity'), key: 'quantity', width: 18 },
      { header: t('maintenance.unit'), key: 'unit', width: 18 },
    ];
    for (const row of data.records)
      for (const material of row.materials)
        parts.addRow({ number: row.number, ...material });
    for (const page of workbook.worksheets) {
      page.getRow(1).font = { bold: true };
      page.views = [{ state: 'frozen', ySplit: 1 }];
      page.autoFilter = {
        from: 'A1',
        to: { row: 1, column: page.columnCount },
      };
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font(
    fileURLToPath(
      new URL('../../assets/fonts/NotoSans-Regular.ttf', import.meta.url),
    ),
  );
  doc.fontSize(20).fillColor('#164d80').text(t('maintenance.reportTitle'));
  doc
    .moveDown()
    .fontSize(12)
    .fillColor('#17283a')
    .text(
      data.machine.fleetNumber +
        ' · ' +
        data.machine.manufacturer +
        ' ' +
        data.machine.model,
    );
  doc
    .fontSize(9)
    .text(t('maintenance.reportMachine') + ': ' + data.machine.id)
    .text(t('maintenance.reportOrganization') + ': ' + data.organizationId)
    .text(t('maintenance.reportGenerated') + ': ' + data.generatedAt)
    .text(t('maintenance.reportActor') + ': ' + data.generatedBy)
    .text(t('maintenance.reportDisclaimer'));
  for (const row of data.records) {
    if (doc.y > 650) doc.addPage();
    doc
      .moveDown()
      .fontSize(12)
      .fillColor('#164d80')
      .text(row.number + ' · ' + row.title);
    doc
      .fontSize(9)
      .fillColor('#17283a')
      .text(row.type + ' / ' + row.status)
      .text(
        t('maintenance.plannedAt') +
          ': ' +
          (row.plannedAt ?? '—') +
          ' / ' +
          t('maintenance.dueAt') +
          ': ' +
          (row.dueAt ?? '—'),
      )
      .text(
        t('maintenance.start') +
          ': ' +
          (row.startedAt ?? '—') +
          ' / ' +
          t('maintenance.complete') +
          ': ' +
          (row.completedAt ?? '—'),
      );
    for (const task of row.tasks)
      doc.text(
        (task.completedAt
          ? '[' + t('maintenance.reportDone') + '] '
          : '[' + t('maintenance.reportPending') + '] ') + task.description,
      );
    for (const m of row.materials)
      doc.text(m.description + ' · ' + m.quantity + ' ' + m.unit);
  }
  doc.end();
  return result;
}
