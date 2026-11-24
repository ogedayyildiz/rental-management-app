import { Decimal } from 'decimal.js';
import type { RentalTransportInput } from '@rental/validation';
import { taxBreakdown } from '../finance/tax.js';

const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
// Quote comparison, not earned revenue, a payment, or an equipment rental rate.
export function transportAmounts(quote: RentalTransportInput) {
  const customerNet = taxBreakdown(
    quote.customerPrice,
    quote.customerTax,
  )!.netAmount;
  const supplierNet = quote.supplierQuote
    ? taxBreakdown(quote.supplierQuote.amount, quote.supplierQuote.tax)!
        .netAmount
    : null;
  return {
    customerNet,
    supplierNet,
    estimatedMargin:
      supplierNet === null
        ? null
        : new D(customerNet).minus(supplierNet).toFixed(2),
  };
}
