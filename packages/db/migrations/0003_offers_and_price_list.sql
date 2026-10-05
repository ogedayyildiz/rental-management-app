ALTER TABLE "machine_models" ADD COLUMN "daily_rate" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "machine_models" ADD COLUMN "weekly_rate" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "machine_models" ADD COLUMN "monthly_rate" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "rental_items" ADD COLUMN "confirmed" boolean DEFAULT false NOT NULL;