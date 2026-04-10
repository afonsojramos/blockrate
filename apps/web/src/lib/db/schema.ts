/**
 * Hosted blockrate.app Postgres schema — single source of truth.
 *
 * Ownership graph:
 *   user (Better Auth)  ──1:1──→ app_accounts  ──1:N──→ api_keys
 *                                      │                    │
 *                                      │                    └──1:N──→ events
 *                                      └──1:N──→ usage_counters
 *
 * - Better Auth's tables (user/session/account/verification) are generated
 *   into ./auth-schema.ts and re-exported below.
 * - app_accounts is 1:1 with user for v1 — the table exists so we can add
 *   teams/billing later without rewriting api_keys' FK target.
 * - api_keys are stored as sha256(plaintext); plaintext is shown ONCE on
 *   creation. Lookup is by key_prefix (first 8 chars of plaintext) followed
 *   by a constant-time hash compare.
 * - events are owned at the api_key level (an api_key represents a "service").
 *   user_agent is TRUNCATED to browser family + major version at ingest.
 * - usage_counters track events per (account_id, year_month) for quota
 *   enforcement against the free tier limit.
 */

import { sql } from "drizzle-orm";
import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

// Re-export Better Auth tables so a single Drizzle config sees everything
export * from "./auth-schema";

// ─── Account ─────────────────────────────────────────────────────────────

export const appAccounts = pgTable("app_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ─── API keys ────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => appAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First 8 chars of the plaintext key — shown in UI for identification. */
    keyPrefix: text("key_prefix").notNull(),
    /** sha256(plaintext) — never the plaintext. */
    keyHash: text("key_hash").notNull().unique(),
    /** Optional service label — defaults to "default" at ingest if absent. */
    service: text("service").notNull().default("default"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    byAccount: index("idx_api_keys_account").on(t.accountId),
    byPrefix: index("idx_api_keys_prefix").on(t.keyPrefix),
  }),
);

// ─── Events ──────────────────────────────────────────────────────────────

export const statusEnum = pgEnum("block_rate_status", ["loaded", "blocked"]);

export const events = pgTable(
  "events",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => appAccounts.id, { onDelete: "cascade" }),
    apiKeyId: integer("api_key_id")
      .notNull()
      .references(() => apiKeys.id, { onDelete: "cascade" }),
    service: text("service").notNull().default("default"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    url: text("url").notNull(),
    /** Truncated browser family + major version. NEVER the raw UA. */
    userAgent: text("user_agent").notNull(),
    provider: text("provider").notNull(),
    status: statusEnum("status").notNull(),
    latency: integer("latency").notNull(),
  },
  (t) => ({
    byAccountService: index("idx_events_account_service").on(t.accountId, t.service, t.timestamp),
    byApiKey: index("idx_events_api_key").on(t.apiKeyId),
    byProvider: index("idx_events_provider").on(t.provider),
  }),
);

// ─── Usage counters ──────────────────────────────────────────────────────

export const usageCounters = pgTable(
  "usage_counters",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => appAccounts.id, { onDelete: "cascade" }),
    /** YYYY-MM, e.g. "2026-04". */
    yearMonth: text("year_month").notNull(),
    eventCount: integer("event_count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.accountId, t.yearMonth] }),
  }),
);

// ─── Daily provider stats (rollup for hero chart) ───────────────────────

/**
 * Global aggregate of per-provider block rates by calendar day. Populated
 * by the retention cron BEFORE deleting old events, so the historical
 * trend survives retention. No account_id — this is public data for the
 * landing page hero chart.
 */
export const dailyProviderStats = pgTable(
  "daily_provider_stats",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(), // YYYY-MM-DD (UTC)
    provider: text("provider").notNull(),
    totalChecks: integer("total_checks").notNull().default(0),
    blocked: integer("blocked").notNull().default(0),
  },
  (t) => ({
    byDateProvider: uniqueIndex("idx_daily_stats_date_provider").on(t.date, t.provider),
  }),
);

export type AppAccount = typeof appAccounts.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type UsageCounter = typeof usageCounters.$inferSelect;
export type DailyProviderStat = typeof dailyProviderStats.$inferSelect;
