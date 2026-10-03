-- Extensions must exist before any table uses their types.
CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
