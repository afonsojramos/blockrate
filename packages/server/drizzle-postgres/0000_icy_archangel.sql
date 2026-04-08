CREATE TYPE "public"."block_rate_status" AS ENUM('loaded', 'blocked');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"service" text DEFAULT 'default' NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"url" text NOT NULL,
	"user_agent" text NOT NULL,
	"provider" text NOT NULL,
	"status" "block_rate_status" NOT NULL,
	"latency" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"api_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_tenant_service" ON "events" USING btree ("tenant_id","service","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_events_provider" ON "events" USING btree ("provider");