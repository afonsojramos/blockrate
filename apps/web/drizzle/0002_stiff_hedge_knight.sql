ALTER TABLE "app_accounts" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "app_accounts" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "app_accounts" ADD COLUMN "stripe_subscription_status" text;--> statement-breakpoint
ALTER TABLE "app_accounts" ADD COLUMN "stripe_current_period_end" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_app_accounts_stripe_customer" ON "app_accounts" USING btree ("stripe_customer_id");