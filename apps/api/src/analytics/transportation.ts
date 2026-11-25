import { Decimal } from 'decimal.js';
import type { AnalyticsReport } from '@rental/validation';
import type { FinanceRental, FinanceVisibility } from './contracts.js';
import { taxBreakdown } from '../finance/tax.js';

const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
// Fixed, rental-level quote amounts. No time proration or machine allocation.
export function transportSummary(
  rentals: FinanceRental[],
  v: FinanceVisibility,
  from: number,
  to: number,
): NonNullable<AnalyticsReport['transportation']> {
  const groups = new Map<
    string,
    NonNullable<AnalyticsReport['transportation']>[number]
  >();
  for (const rental of rentals) {
    const quote = rental.transportation,
      at = Date.parse(rental.plannedStartAt ?? rental.createdAt ?? '');
    if (
      !quote ||
      rental.status === 'CANCELLED' ||
      !Number.isFinite(at) ||
      at < from ||
      at >= to ||
      !quote.currency
    )
      continue;
    const key = rental.status + ':' + quote.currency;
    let group = groups.get(key);
    if (!group) {
      group = {
        status: rental.status as NonNullable<
          AnalyticsReport['transportation']
        >[number]['status'],
        currency: quote.currency,
        count: 0,
        ...(v.pricing ? { customerNet: '0.00' } : {}),
        ...(v.transportCosts
          ? { supplierNet: '0.00', missingSupplierQuotes: 0 }
          : {}),
      };
      groups.set(key, group);
    }
    group.count++;
    if (v.pricing && quote.customerPrice !== undefined && quote.customerTax) {
      group.customerNet = new D(group.customerNet!)
        .plus(taxBreakdown(quote.customerPrice, quote.customerTax)!.netAmount)
        .toFixed(2);
    }
    if (v.transportCosts) {
      if (!quote.supplierQuote) {
        group.missingSupplierQuotes!++;
        group.supplierNet = null;
      } else if (group.supplierNet !== null) {
        group.supplierNet = new D(group.supplierNet!)
          .plus(
            taxBreakdown(quote.supplierQuote.amount, quote.supplierQuote.tax)!
              .netAmount,
          )
          .toFixed(2);
      }
      if (v.pricing)
        group.estimatedMargin =
          group.supplierNet === null
            ? null
            : new D(group.customerNet!).minus(group.supplierNet!).toFixed(2);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}
