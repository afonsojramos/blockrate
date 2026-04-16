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
    const { and, eq, gte, sql } = await import("drizzle-orm");

    const plan = getPlan(account.plan);
    // Cap requested window at plan's dashboardHistoryDays
    const sinceDays = Math.min(data.sinceDays, plan.dashboardHistoryDays);
    const since = new Date(Date.now() - sinceDays * 86_400_000);

    const where = data.service
      ? and(
          eq(events.accountId, account.id),
          eq(events.service, data.service),
          gte(events.timestamp, since),
        )
      : and(eq(events.accountId, account.id), gte(events.timestamp, since));

    // Per-provider aggregation
    const statsRows = await db
      .select({
        provider: events.provider,
        total: sql<number>`COUNT(*)`.as("total"),
        blocked: sql<number>`SUM(CASE WHEN ${events.status} = 'blocked' THEN 1 ELSE 0 END)`.as(
          "blocked",
        ),
        avgLatency:
          sql<number>`AVG(CASE WHEN ${events.status} = 'loaded' THEN ${events.latency} END)`.as(
            "avg_latency",
          ),
      })
      .from(events)
      .where(where)
      .groupBy(events.provider);

    const stats = statsRows
      .map((r) => ({
        provider: r.provider,
        total: Number(r.total),
        blocked: Number(r.blocked),
        blockRate: Number(r.total) > 0 ? Number(r.blocked) / Number(r.total) : 0,
        avgLatency: Math.round(Number(r.avgLatency) || 0),
      }))
      .sort((a, b) => b.blockRate - a.blockRate);

    // Distinct service labels for the filter dropdown
    const serviceRows = await db
      .selectDistinct({ service: events.service })
      .from(events)
      .where(eq(events.accountId, account.id));
    const services = serviceRows.map((r) => r.service).sort();

    return {
      stats,
      services,
      sinceDays,
      service: data.service ?? null,
      planLabel: plan.label,
      planDashboardHistoryDays: plan.dashboardHistoryDays,
    };
  });

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
  };
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
