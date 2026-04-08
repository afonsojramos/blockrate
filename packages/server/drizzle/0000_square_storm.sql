CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` integer NOT NULL,
	`service` text DEFAULT 'default' NOT NULL,
	`timestamp` integer NOT NULL,
	`url` text NOT NULL,
	`user_agent` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`latency` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_events_tenant_service` ON `events` (`tenant_id`,`service`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_events_provider` ON `events` (`provider`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`api_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_api_key_unique` ON `tenants` (`api_key`);