/**
 * Server functions for the dashboard:
 *   getStats          per-provider aggregation for the overview page
 *   getServices       distinct service labels for the filter dropdown
 *   getOverviewData   single round trip — combines getStats + getServices + plan
 *   getUsageSnapshot  current month usage vs plan limit
 *   exportEventsCsv   stream the account's events as CSV
 *   deleteAccount     cascading delete: events → api_keys → app_account → user
 *
 * All functions are auth-gated through requireAccount().
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type * as schema from "@/lib/db/schema";
import { DAY_MS } from "@/lib/time";
import { applyFloor } from "@/lib/providers";

export interface BenchmarkedRow {
  provider: string;
  total: number;
  blocked: number;
  blockRate: number;
  avgLatency: number;
  /** Public all-time rate for this provider, floored — null below the publish
   *  sample floor or when there's no public data. The account's own rate is
   *  never floored; only this benchmark is. */
  benchmarkRate: number | null;
  /** own blockRate − benchmarkRate (rate units), or null when no benchmark. */
  benchmarkDelta: number | null;
}

/**
 * Merge the public per-provider benchmark onto an account's own stat rows.
 * Pure (no DB): the account's own blockRate is shown as-is; the public
 * benchmark is gated by applyFloor so the dashboard never compares against a
 * noisy below-floor public number.
 */
export function attachBenchmark(
  stats: Omit<BenchmarkedRow, "benchmarkRate" | "benchmarkDelta">[],
  heroProviders: { name: string; rate: number; total: number }[],
): BenchmarkedRow[] {
  const byName = new Map(heroProviders.map((h) => [h.name, h]));
  return stats.map((s) => {
    const hero = byName.get(s.provider);
    const benchmarkRate = hero ? applyFloor(hero.rate, hero.total) : null;
    return {
      ...s,
      benchmarkRate,
      benchmarkDelta: benchmarkRate === null ? null : s.blockRate - benchmarkRate,
    };
  });
}

const requireAccount = async () => {
  const { auth } = await import("@/lib/auth.server");
  const { db } = await import("@/lib/db/index.server");
  const { appAccounts } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const session = await auth.api.getSession({ headers: getRequest().headers });
  if (!session) throw new Error("unauthorized");

  const rows = await db
    .select()
    .from(appAccounts)
    .where(eq(appAccounts.userId, session.user.id))
    .limit(1);
  const account = rows[0];
  if (!account) throw new Error("no app_account for user");
  return { session, account, db, appAccounts };
};

// ─── getOverviewData ────────────────────────────────────────────────────

const overviewInput = z.object({
  sinceDays: z.number().int().min(1).max(90).default(7),
  service: z.string().min(1).max(64).optional(),
});

export const getOverviewData = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => overviewInput.parse(input))
  .handler(async ({ data }) => {
    const { account } = await requireAccount();
    const { db } = await import("@/lib/db/index.server");
    const { events } = await import("@/lib/db/schema");
    const { getPlan } = await import("@/lib/plans");
    const { and, count, eq, gte, sql } = await import("drizzle-orm");

    const plan = getPlan(account.plan);
    // Cap requested window at plan's dashboardHistoryDays
    const sinceDays = Math.min(data.sinceDays, plan.dashboardHistoryDays);
    const since = new Date(Date.now() - sinceDays * DAY_MS);

    const where = data.service
      ? and(
          eq(events.accountId, account.id),
          eq(events.service, data.service),
          gte(events.timestamp, since),
        )
      : and(eq(events.accountId, account.id), gte(events.timestamp, since));

    // Per-provider aggregation.
    //
    // Postgres COUNT/SUM return bigint and AVG returns numeric — all of which
    // the pg/pglite drivers surface as *strings*. `.mapWith(Number)` (and the
    // drizzle `count()` helper, which applies it internally) coerces at the
    // driver boundary so the headline block rate is computed on real numbers,
    // never on a string the `<number>` annotation merely claims to be. AVG is
    // null for a provider with no loaded events, so it is typed `number | null`.
    const statsRows = await db
      .select({
        provider: events.provider,
        total: count(),
        blocked: sql<number>`SUM(CASE WHEN ${events.status} = 'blocked' THEN 1 ELSE 0 END)`.mapWith(
          Number,
        ),
        avgLatency: sql<
          number | null
        >`AVG(CASE WHEN ${events.status} = 'loaded' THEN ${events.latency} END)`.mapWith(Number),
      })
      .from(events)
      .where(where)
      .groupBy(events.provider);

    const stats = statsRows
      .map((r) => ({
        provider: r.provider,
        total: r.total,
        blocked: r.blocked,
        blockRate: r.total > 0 ? r.blocked / r.total : 0,
        avgLatency: Math.round(r.avgLatency ?? 0),
      }))
      .sort((a, b) => b.blockRate - a.blockRate);

    // Distinct service labels for the filter dropdown
    const serviceRows = await db
      .selectDistinct({ service: events.service })
      .from(events)
      .where(eq(events.accountId, account.id));
    const services = serviceRows.map((r) => r.service).sort();

    // Attach the public per-provider benchmark (cached, floored) so each row
    // can show "you vs all sites".
    const { getHeroStats } = await import("@/server/hero-stats");
    const hero = await getHeroStats();
    const benchmarked = attachBenchmark(stats, hero?.providers ?? []);

    const hasReceivedEvents = await hasReceivedEventsForAccount(db, account.id);

    return {
      stats: benchmarked,
      services,
      sinceDays,
      service: data.service ?? null,
      planLabel: plan.label,
      planDashboardHistoryDays: plan.dashboardHistoryDays,
      hasReceivedEvents,
    };
  });

// ─── hasReceivedEvents ──────────────────────────────────────────────────

/**
 * True once the account has ingested at least one event, ever. Derived from
 * usage_counters — the aggregate incremented on every successful ingest —
 * NOT api_keys.last_used_at, whose touch is best-effort fire-and-forget
 * (see routes/api/ingest.ts step 8). DB-parameterized core so it is DB-real
 * testable without a session, mirroring setWeeklyDigestForAccount.
 */
export async function hasReceivedEventsForAccount(
  db: BunSQLDatabase<typeof schema>,
  accountId: number,
): Promise<boolean> {
  const { usageCounters } = await import("@/lib/db/schema");
  const { and, eq, gt } = await import("drizzle-orm");
  const rows = await db
    .select({ eventCount: usageCounters.eventCount })
    .from(usageCounters)
    .where(and(eq(usageCounters.accountId, accountId), gt(usageCounters.eventCount, 0)))
    .limit(1);
  return rows.length > 0;
}

// ─── getUsageSnapshot ───────────────────────────────────────────────────

export const getUsageSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { account, session } = await requireAccount();
  const { getUsage } = await import("@/lib/quota.server");
  const { getPlan } = await import("@/lib/plans");

  const plan = getPlan(account.plan);
  const usage = await getUsage(account.id, plan.eventsPerMonth);
  return {
    email: session.user.email,
    plan,
    usage,
    stripe: {
      hasSubscription: Boolean(account.stripeCustomerId),
      subscriptionStatus: account.stripeSubscriptionStatus,
      currentPeriodEnd: account.stripeCurrentPeriodEnd?.toISOString() ?? null,
    },
    weeklyDigest: account.weeklyDigest,
  };
});

// ─── setWeeklyDigest ──────────────────────────────────────────────────────

/** Toggle the caller's weekly-digest opt-out. Account-parameterized core so
 *  it's DB-real testable without a session. */
export async function setWeeklyDigestForAccount(
  db: BunSQLDatabase<typeof schema>,
  accountId: number,
  enabled: boolean,
): Promise<{ enabled: boolean }> {
  const { appAccounts } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(appAccounts).set({ weeklyDigest: enabled }).where(eq(appAccounts.id, accountId));
  return { enabled };
}

export const setWeeklyDigest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { account, db } = await requireAccount();
    return setWeeklyDigestForAccount(db, account.id, data.enabled);
  });

// ─── exportEventsCsv ────────────────────────────────────────────────────

export const exportEventsCsv = createServerFn({ method: "GET" }).handler(async () => {
  const { account } = await requireAccount();
  const { db } = await import("@/lib/db/index.server");
  const { events } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db
    .select({
      timestamp: events.timestamp,
      service: events.service,
      provider: events.provider,
      status: events.status,
      latency: events.latency,
      url: events.url,
      userAgent: events.userAgent,
    })
    .from(events)
    .where(eq(events.accountId, account.id))
    .orderBy(events.timestamp);

  const header = "timestamp,service,provider,status,latency_ms,url,browser\n";
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const body = rows
    .map((r) =>
      [
        r.timestamp.toISOString(),
        escape(r.service),
        escape(r.provider),
        r.status,
        r.latency,
        escape(r.url),
        escape(r.userAgent),
      ].join(","),
    )
    .join("\n");

  return { csv: header + body, count: rows.length };
});

// ─── deleteAccount ──────────────────────────────────────────────────────

/**
 * Cascading delete: events → api_keys → usage_counters → app_accounts
 * → user (via Better Auth's `account` and `session` cascade FKs).
 *
 * The Better Auth `user` row is the root — deleting it cascades to
 * sessions and oauth accounts via FK ON DELETE CASCADE in the generated
 * schema. Our `app_accounts.user_id` also cascades, which fans out to
 * api_keys / events / usage_counters via their own FKs.
 */
export const deleteAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { session, account, db } = await requireAccount();
  const { user: userTable } = await import("@/lib/db/auth-schema");
  const { eq } = await import("drizzle-orm");

  // Cancel any active Stripe subscription before cascade-deleting the DB rows.
  // If this fails, proceed anyway — an orphaned Stripe sub is preferable to a
  // blocked account deletion. Stripe will eventually cancel on payment failure.
  if (account.stripeSubscriptionId) {
    try {
      const { env } = await import("@/lib/env.server");
      if (env.STRIPE_SECRET_KEY) {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.cancel(account.stripeSubscriptionId);
      }
    } catch (err) {
      console.error("[deleteAccount] failed to cancel Stripe subscription:", err);
    }
  }

  await db.delete(userTable).where(eq(userTable.id, session.user.id));
  return { ok: true };
});
