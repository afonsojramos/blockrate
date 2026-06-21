CREATE TYPE "public"."alert_channel" AS ENUM('email', 'webhook', 'slack');--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "channel" "alert_channel" DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "webhook_url" text;