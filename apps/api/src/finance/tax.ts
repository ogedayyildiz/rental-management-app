import { Decimal } from 'decimal.js';
import { taxSchema, type Tax } from '@rental/validation';

const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
export function taxBreakdown(amount: string, tax: Tax) {
  if (tax.mode === 'UNSPECIFIED') return null;
  const entered = new D(amount);
  const factor = new D('1').plus('rate' in tax ? new D(tax.rate).div(100) : 0);
  const net = (
    tax.mode === 'INCLUSIVE' ? entered.div(factor) : entered
  ).toDecimalPlaces(2);
  const gross = (
    tax.mode === 'EXCLUSIVE' ? entered.mul(factor) : entered
  ).toDecimalPlaces(2);
  return {
    netAmount: net.toFixed(2),
    taxAmount: gross.minus(net).toFixed(2),
    grossAmount: gross.toFixed(2),
  };
}
export function taxColumns(tax: Tax) {
  return {
    taxMode: tax.mode,
    taxRate: 'rate' in tax ? tax.rate : null,
    taxReason: 'reason' in tax ? tax.reason : null,
  };
}
export function readTax(row: {
  taxMode: string;
  taxRate: { toFixed(): string } | null;
  taxReason: string | null;
}): Tax {
  return taxSchema.parse({
    mode: row.taxMode,
    ...(row.taxRate === null ? {} : { rate: row.taxRate.toFixed() }),
    ...(row.taxReason === null ? {} : { reason: row.taxReason }),
  });
}
