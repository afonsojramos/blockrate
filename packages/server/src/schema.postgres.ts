import { sql } from "drizzle-orm";
import { pgTable, serial, text, integer, timestamp, index, pgEnum } from "drizzle-orm/pg-core";

export const statusEnum = pgEnum("block_rate_status", ["loaded", "blocked"]);

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    service: text("service").notNull().default("default"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    url: text("url").notNull(),
    userAgent: text("user_agent").notNull(),
    provider: text("provider").notNull(),
    status: statusEnum("status").notNull(),
    latency: integer("latency").notNull(),
  },
  (t) => ({
    byTenantService: index("idx_events_tenant_service").on(t.tenantId, t.service, t.timestamp),
    byProvider: index("idx_events_provider").on(t.provider),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
