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
  boolean,
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

export const appAccounts = pgTable(
  "app_accounts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("free"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /** Stripe Customer ID — stored eagerly at first checkout. */
    stripeCustomerId: text("stripe_customer_id"),
    /** Stripe Subscription ID — set on checkout, cleared on cancellation. */
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Mirrors Stripe subscription.status (active, past_due, canceled, etc.). */
    stripeSubscriptionStatus: text("stripe_subscription_status"),
    /** End of current billing period — for "cancels on [date]" display. */
    stripeCurrentPeriodEnd: timestamp("stripe_current_period_end", { withTimezone: true }),
    /** Opt-out for the weekly digest email. Default on; toggled in settings. */
    weeklyDigest: boolean("weekly_digest").notNull().default(true),
  },
  (t) => ({
    byStripeCustomer: uniqueIndex("idx_app_accounts_stripe_customer").on(t.stripeCustomerId),
  }),
);

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
    byTimestamp: index("idx_events_timestamp").on(t.timestamp),
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

// ─── Alert rules (continuous monitoring) ────────────────────────────────

/** Direction of the threshold comparison. `gte` fires when the block rate is
 *  AT OR ABOVE the threshold (the common "something is being blocked" alert);
 *  `lte` fires when it drops AT OR BELOW (e.g. confirm a remediation worked). */
export const alertComparatorEnum = pgEnum("alert_comparator", ["gte", "lte"]);

/** Where a fired rule delivers. `email` → account owner; `webhook`/`slack` →
 *  POST to `webhookUrl` (slack gets a `{ text }` body, webhook a JSON payload). */
export const alertChannelEnum = pgEnum("alert_channel", ["email", "webhook", "slack"]);

/**
 * Per-account alert rules. A rule fires (sends one email) when the block rate
 * for its scope crosses `threshold` (a whole percent) over the trailing
 * `windowHours`, provided at least `minSample` checks exist in that window.
 *
 * - `provider` / `service` null means "any" — the eval query only adds the
 *   equality filter for the non-null fields.
 * - Spam control is `lastFiredAt` + `cooldownHours`: a rule will not re-fire
 *   within its cooldown. No separate notifications table for v1.
 * - Gating is by count vs the plan's `maxAlertRules` (Free = 0). See plans.ts.
 */
export const alertRules = pgTable(
  "alert_rules",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => appAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** null = any provider. */
    provider: text("provider"),
    /** null = any service. */
    service: text("service"),
    comparator: alertComparatorEnum("comparator").notNull(),
    /** Whole-percent threshold, 0–100. */
    threshold: integer("threshold").notNull(),
    /** Trailing window the rate is computed over. */
    windowHours: integer("window_hours").notNull(),
    /** Min checks in the window before the rule may fire (avoids thin-data noise). */
    minSample: integer("min_sample").notNull().default(100),
    /** A fired rule will not re-fire within this many hours. */
    cooldownHours: integer("cooldown_hours").notNull().default(24),
    /** Delivery channel. Defaults to email so existing rules are unchanged. */
    channel: alertChannelEnum("channel").notNull().default("email"),
    /** Target URL for webhook/slack channels; null for email. */
    webhookUrl: text("webhook_url"),
    enabled: boolean("enabled").notNull().default(true),
    /** Whether the rule's condition was met at the last evaluation. Drives
     *  edge-triggered firing: a rule fires only when it CROSSES into the
     *  matching state (false → true), never on every sweep it stays matched. */
    lastMatched: boolean("last_matched").notNull().default(false),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    byAccount: index("idx_alert_rules_account").on(t.accountId),
  }),
);

export type AppAccount = typeof appAccounts.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type UsageCounter = typeof usageCounters.$inferSelect;
export type DailyProviderStat = typeof dailyProviderStats.$inferSelect;
export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;
