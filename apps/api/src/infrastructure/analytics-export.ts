import ExcelJS from 'exceljs';
import type { AnalyticsReport, AnalyticsRow } from '@rental/validation';
import { translate, type Locale, type TranslationKey } from '@rental/i18n';
// Uses exactly the redacted read contract. No repository access or independent formulas.
export async function analyticsExport(
  report: AnalyticsReport,
  locale: Locale = 'en',
): Promise<Buffer> {
  const t = (key: TranslationKey) => translate(locale, key);
  const book = new ExcelJS.Workbook();
  const context = book.addWorksheet('ESTIMATE_V1');
  context.addRows([
    ['valuationPolicy', report.valuationPolicy],
    ['meaning', t('finance.notice')],
    ['generatedAt', report.generatedAt],
    ['timezone', report.timezone],
    ['from', report.period.from],
    ['to', report.period.to],
    ['nextCursor', report.nextCursor ?? ''],
    ['exportScope', t('finance.exportScope')],
  ]);
  const add = (name: string, rows: AnalyticsRow[]) => {
    const sheet = book.addWorksheet(name);
    const cols = [
      'id',
      'label',
      'machineCount',
      'rentalCount',
      'activeRentals',
      'observationSeconds',
      'rentedSeconds',
      'unrentedSeconds',
      'utilizationPercentage',
      'currency',
      ...(report.visibility.acquisition ? ['acquisitionCost'] : []),
      ...(report.visibility.pricing
        ? [
            'estimatedContractedValue',
            'estimatedAccruedValue',
            'estimatedCompletedValue',
            'valueTypes',
          ]
        : []),
      ...(report.visibility.costs ? ['maintenanceCost'] : []),
      ...(report.visibility.costs && report.visibility.pricing
        ? ['estimatedContribution']
        : []),
    ];
    const headers: Record<string, TranslationKey> = {
      label: 'finance.name',
      machineCount: 'finance.machineCount',
      rentalCount: 'finance.rentalCount',
      activeRentals: 'finance.activeRentals',
      observationSeconds: 'finance.observationSeconds',
      rentedSeconds: 'finance.rentedSeconds',
      unrentedSeconds: 'finance.unrentedSeconds',
      utilizationPercentage: 'finance.utilization',
      currency: 'finance.currency',
      acquisitionCost: 'finance.acquisitionCost',
      estimatedContractedValue: 'finance.estimatedContractedValue',
      estimatedAccruedValue: 'finance.estimatedAccruedValue',
      estimatedCompletedValue: 'finance.estimatedCompletedValue',
      valueTypes: 'finance.valueTypes',
      maintenanceCost: 'finance.maintenanceCost',
      estimatedContribution: 'finance.estimatedContribution',
    };
    sheet.columns = cols.map((key) => ({
      header: headers[key] ? t(headers[key]) : key,
      key,
      width: 26,
    }));
    for (const row of rows) {
      const currencies = new Set([
        ...row.values.map((v) => v.currency),
        ...(row.acquisitionCost ?? []).map((v) => v.currency),
      ]);
      if (!currencies.size) currencies.add('');
      for (const currency of currencies) {
        const values = row.values.find((v) => v.currency === currency);
        sheet.addRow({
          id: row.id,
          label: row.label,
          machineCount: row.machineCount,
          rentalCount: row.rentalCount,
          activeRentals: row.activeRentals,
          observationSeconds: row.utilization.observationSeconds,
          rentedSeconds: row.utilization.rentedSeconds,
          unrentedSeconds: row.utilization.unrentedSeconds,
          utilizationPercentage: row.utilization.percentage,
          currency,
          acquisitionCost: row.acquisitionCost?.find(
            (c) => c.currency === currency,
          )?.amount,
          ...values,
          valueTypes: values?.valueTypes
            ?.map((v) => t(`finance.${v}`))
            .join(', '),
        });
      }
    }
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };
  add(t('finance.summary'), [report.summary]);
  add(locale === 'en' ? 'Performance' : 'Performans', report.items);
  return Buffer.from(await book.xlsx.writeBuffer());
}
