CREATE TYPE "public"."alert_comparator" AS ENUM('gte', 'lte');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"name" text NOT NULL,
	"provider" text,
	"service" text,
	"comparator" "alert_comparator" NOT NULL,
	"threshold" integer NOT NULL,
	"window_hours" integer NOT NULL,
	"min_sample" integer DEFAULT 100 NOT NULL,
	"cooldown_hours" integer DEFAULT 24 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_matched" boolean DEFAULT false NOT NULL,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_account_id_app_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."app_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alert_rules_account" ON "alert_rules" USING btree ("account_id");