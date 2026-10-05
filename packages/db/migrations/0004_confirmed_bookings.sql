-- Lines on contracts that were already confirmed (anything past the offer
-- stage) keep blocking the calendar.
UPDATE rental_items ri SET confirmed = true
FROM rental_contracts rc
WHERE rc.id = ri.contract_id AND rc.status IN ('reserved', 'active', 'completed');
--> statement-breakpoint
-- Offers (unconfirmed lines) no longer block a machine; confirmed ones do.
ALTER TABLE rental_items DROP CONSTRAINT rental_items_no_overlap;
--> statement-breakpoint
ALTER TABLE rental_items ADD CONSTRAINT rental_items_no_overlap
  EXCLUDE USING gist (
    machine_id WITH =,
    tstzrange(start_at, coalesce(end_at, 'infinity'::timestamptz)) WITH &&
  ) WHERE (confirmed AND cancelled_at IS NULL);
