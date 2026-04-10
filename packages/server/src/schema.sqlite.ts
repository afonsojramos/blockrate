import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    service: text("service").notNull().default("default"),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
    url: text("url").notNull(),
    userAgent: text("user_agent").notNull(),
    provider: text("provider").notNull(),
    status: text("status", { enum: ["loaded", "blocked"] }).notNull(),
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
