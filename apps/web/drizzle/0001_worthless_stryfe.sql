CREATE TABLE IF NOT EXISTS "daily_provider_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"provider" text NOT NULL,
	"total_checks" integer DEFAULT 0 NOT NULL,
	"blocked" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_daily_stats_date_provider" ON "daily_provider_stats" USING btree ("date","provider");